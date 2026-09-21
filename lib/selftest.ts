import { SEED_LIBRARY } from "./alphas/library";
import { parse, pretty } from "./alphas/parser";
import { buildPanel, evalExpression } from "./alphas/eval";
import { UNIVERSE } from "./data/universe";
import { universeFromCsv } from "./data/csv";
import { criticRewrite } from "./agents/mutate";
import { mockPropose } from "./agents/propose-mock";
import { runPipeline, scratchBacktest } from "./agents/pipeline";
import { LIVE_TRADING, PAPER_BROKER, llmProvider, publicFlags } from "./flags";
import { extractJsonObject, appendSsePayload, NIM_MODEL, NIM_TIMEOUT_MS } from "./llm/nvidia";
import { emptySession, loadSession, upsertSession } from "./store/session";
import { isDurableStore, storeBackend } from "./store/backend";
import {
  accessCodeValid,
  authRequired,
  signGateCookie,
  verifyGateCookie,
} from "./auth";
import {
  alpacaKeysReady,
  isAllowedPaperBase,
  isLiveAlpacaUrl,
  paperBaseUrl,
  paperMode,
  readPaperAccount,
  symbolAllowedOnAlpaca,
  submitPaperOrder,
} from "./broker/alpaca";
import { researchBookOrders } from "./broker/book";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

function sampleCsv(): string {
  const header = "date,ticker,open,high,low,close,volume";
  const rows: string[] = [header];
  const start = Date.UTC(2020, 0, 2);
  for (let i = 0; i < 120; i++) {
    const d = new Date(start + i * 86400000);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    const iso = d.toISOString().slice(0, 10);
    const a = 10 + i * 0.02;
    const b = 20 - i * 0.01;
    rows.push(`${iso},AAA,${a},${a + 0.2},${a - 0.2},${a + 0.05},${1000 + i}`);
    rows.push(`${iso},BBB,${b},${b + 0.3},${b - 0.1},${b - 0.02},${2000 + i}`);
  }
  return rows.join("\n");
}

async function main() {
  for (const seed of SEED_LIBRARY) {
    const ast = parse(seed.expression);
    assert(pretty(ast).length > 0, `pretty failed ${seed.id}`);
  }
  const panel = buildPanel(UNIVERSE);
  assert(panel.nS === 10, "expected 10 names");
  assert(panel.nT > 900, "expected multi-year trading days");

  for (const seed of SEED_LIBRARY) {
    const v = evalExpression(seed.expression, panel);
    let finite = 0;
    for (let i = 0; i < v.length; i++) if (Number.isFinite(v[i])) finite++;
    assert(finite > 200, `${seed.id} produced too few values (${finite})`);
  }

  const result = runPipeline(UNIVERSE);
  assert(result.evaluated.length === SEED_LIBRARY.length, "eval count");
  assert(result.book.selected.every((alpha) => alpha.scores.passed), "book includes an alpha that failed training gates");
  assert(result.book.equity.length > 10, "equity");
  if (result.book.selected.length === 0) {
    assert(result.book.dailyReturns.every((ret) => ret === 0), "empty training book must stay in cash");
  }
  assert(result.universe.source === "DEMO10", "default universe meta");
  assert(result.universe.nS === 10, "universe nS");

  const parent = "rank(ts_delta(close, 5)) - rank(volume)";
  const mut = criticRewrite(parent, 0);
  assert(mut.expression.replace(/\s+/g, "") !== parent.replace(/\s+/g, ""), "refine must change formula");
  parse(mut.expression);
  const refined = scratchBacktest(UNIVERSE, mut.expression);
  assert(refined.equity.length > 10, "refined equity");
  assert(Number.isFinite(refined.metrics.sharpe), "refined sharpe");

  const mock = mockPropose(0, 4);
  assert(mock.length === 4, "mock propose");
  for (const s of mock) parse(s.expression);

  assert(LIVE_TRADING === false, "LIVE_TRADING must be hard-false");
  assert(PAPER_BROKER.enabled === false, "paper broker disabled");
  assert(paperMode() === "off", "default paper mode is off");
  assert(llmProvider() === "mock", "default LLM is mock without NVIDIA_API_KEY");
  assert(NIM_MODEL === "google/gemma-4-31b-it", "NIM model locked to gemma-4-31b-it");
  assert(NIM_TIMEOUT_MS >= 180_000, "NIM timeout must cover ~2 min cold start");
  assert(
    appendSsePayload("", '{"choices":[{"delta":{"content":"hel"}}]}') === "hel",
    "SSE delta content",
  );
  assert(
    appendSsePayload("hel", '{"choices":[{"delta":{"content":"lo"}}]}') === "hello",
    "SSE delta concat",
  );
  assert(appendSsePayload("hello", "[DONE]") === "hello", "SSE done is a no-op");
  const extracted = extractJsonObject('noise ```json\n{"expression":"rank(close)"}\n```');
  assert(extracted.includes("rank(close)"), "NIM json fence extract");

  assert(isLiveAlpacaUrl("https://api.alpaca.markets"), "live alpaca host");
  assert(isLiveAlpacaUrl("https://api.alpaca.markets/v2"), "live alpaca path");
  assert(!isLiveAlpacaUrl("https://paper-api.alpaca.markets"), "paper alpaca host");
  assert(isAllowedPaperBase("https://paper-api.alpaca.markets"), "paper base allowed");
  assert(!isAllowedPaperBase("https://api.alpaca.markets"), "live base not allowed");
  const prevBase = process.env.ALPACA_BASE_URL;
  process.env.ALPACA_BASE_URL = "https://api.alpaca.markets";
  const liveBase = paperBaseUrl();
  assert(!liveBase.ok, "refuse live Alpaca URL");
  process.env.ALPACA_BASE_URL = "https://broker-app.alpaca.markets";
  assert(!paperBaseUrl().ok, "refuse non-paper alpaca host");
  if (prevBase === undefined) delete process.env.ALPACA_BASE_URL;
  else process.env.ALPACA_BASE_URL = prevBase;
  const paperBase = paperBaseUrl();
  assert(paperBase.ok && paperBase.url === "https://paper-api.alpaca.markets", "default paper base");

  assert(symbolAllowedOnAlpaca("SPY", "DEMO10"), "listed symbol ok on DEMO10");
  assert(!symbolAllowedOnAlpaca("NRGX", "DEMO10"), "synthetic DEMO10 blocked on Alpaca");
  assert(symbolAllowedOnAlpaca("AAA", "upload"), "uploaded ticker may go to paper");

  const prevBroker = process.env.PAPER_BROKER;
  process.env.PAPER_BROKER = "alpaca";
  assert(paperMode() === "sim", "alpaca without keys is offline simulator");
  const simFill = await submitPaperOrder({ symbol: "SPY", side: "buy", qty: 1, type: "market" }, "upload");
  assert(simFill.ok && simFill.source === "sim", "simulator fill");
  const demoRefuse = await submitPaperOrder({ symbol: "NRGX", side: "buy", qty: 1, type: "market" }, "DEMO10");
  assert(demoRefuse.ok && demoRefuse.source === "sim", "sim still fills synthetic names");
  if (prevBroker === undefined) delete process.env.PAPER_BROKER;
  else process.env.PAPER_BROKER = prevBroker;
  assert(paperMode() === "off", "paper mode restored off");

  if (alpacaKeysReady()) {
    const prevPing = process.env.PAPER_BROKER;
    process.env.PAPER_BROKER = "alpaca";
    const acc = await readPaperAccount();
    assert(acc.ok, acc.ok ? "paper account" : acc.reason);
    assert(acc.account.source === "alpaca", "paper account source");
    assert(String(acc.account.status).toUpperCase() === "ACTIVE", "paper account ACTIVE");
    if (prevPing === undefined) delete process.env.PAPER_BROKER;
    else process.env.PAPER_BROKER = prevPing;
  }

  const legs = researchBookOrders(UNIVERSE, result.book, 1);
  assert(legs.length === 4, "research book top-4 longs");
  assert(legs.every((o) => o.side === "buy" && o.type === "market"), "research book buys");

  assert(!authRequired(), "auth public when DEMO_ACCESS_CODE unset");
  const prevCode = process.env.DEMO_ACCESS_CODE;
  const prevSecret = process.env.AUTH_SECRET;
  process.env.DEMO_ACCESS_CODE = "demo-gate";
  process.env.AUTH_SECRET = "unit-test-secret";
  assert(authRequired(), "auth required when code set");
  assert(accessCodeValid("demo-gate"), "access code matches");
  assert(!accessCodeValid("nope"), "access code rejects");
  const cookie = signGateCookie();
  assert(cookie && verifyGateCookie(cookie), "signed cookie verifies");
  assert(!verifyGateCookie("v1.1.deadbeef"), "tampered cookie fails");
  if (prevCode === undefined) delete process.env.DEMO_ACCESS_CODE;
  else process.env.DEMO_ACCESS_CODE = prevCode;
  if (prevSecret === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = prevSecret;

  assert(!isDurableStore(), "store ephemeral without blob token");
  assert(storeBackend() === "ephemeral", "store backend ephemeral");
  const flags = publicFlags();
  assert(flags.liveTrading === false, "flags liveTrading");
  assert(flags.store.durable === false, "flags store.durable");
  assert(flags.auth.required === false, "flags auth.required");
  assert(flags.llm === "mock", "flags llm badge mock");
  assert(flags.paper.broker === "off", "flags paper off");
  assert(flags.paper.keys === false, "flags paper keys unset");
  assert(flags.paper.base === "https://paper-api.alpaca.markets", "flags paper base");

  const csv = universeFromCsv(sampleCsv());
  assert(csv.ok, "csv parse");
  if (csv.ok) {
    assert(csv.universe.tickers.length === 2, "csv tickers");
    assert(csv.universe.dates.length >= 60, "csv dates");
    const uploaded = runPipeline(csv.universe, [], false, {
      source: "upload",
      nS: csv.universe.tickers.length,
      nT: csv.universe.dates.length,
      dates: csv.universe.dates,
      tickers: csv.universe.tickers.map((t) => t.id),
    });
    assert(uploaded.universe.source === "upload", "upload meta");
    assert(uploaded.evaluated.length === SEED_LIBRARY.length, "upload eval");
  }

  const saved = await upsertSession(
    {
      extras: [{ id: "A19R1", name: "t", category: "momentum", expression: parent, source: "wq", rationale: "test" }],
      selectedId: "A19R1",
      expression: parent,
      llmUsed: false,
    },
    { at: new Date().toISOString(), kind: "refine", note: "selftest refine", extraIds: ["A19R1"], selectedId: "A19R1" },
  );
  const loaded = await loadSession();
  assert(loaded.extras.some((s) => s.id === "A19R1"), "session extras persist");
  assert(loaded.runs.some((r) => r.kind === "refine"), "session runs persist");
  assert(saved.version === 1, "session version");
  await upsertSession(emptySession());

  console.log(
    JSON.stringify(
      {
        dates: UNIVERSE.dates.length,
        proposed: result.proposed.length,
        selected: result.book.selected.map((a) => a.id),
        sharpe: Number(result.book.metrics.sharpe.toFixed(3)),
        ret: Number((result.book.metrics.totalReturn * 100).toFixed(2)),
        ic: Number(result.book.metrics.ic.toFixed(4)),
        benchSharpe: Number(result.book.benchMetrics.sharpe.toFixed(3)),
        refine: { label: mut.label, expr: mut.expression, sharpe: Number(refined.metrics.sharpe.toFixed(3)) },
        mockIds: mock.map((s) => s.id),
        llm: llmProvider(),
        liveTrading: LIVE_TRADING,
        store: storeBackend(),
        paper: paperMode(),
        sessionExtras: loaded.extras.map((s) => s.id),
      },
      null,
      2,
    ),
  );
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
