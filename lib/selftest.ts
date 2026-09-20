import { SEED_LIBRARY } from "./alphas/library";
import { parse, pretty } from "./alphas/parser";
import { buildPanel, evalExpression } from "./alphas/eval";
import { UNIVERSE } from "./data/universe";
import { universeFromCsv } from "./data/csv";
import { criticRewrite } from "./agents/mutate";
import { mockPropose } from "./agents/propose-mock";
import { runPipeline, scratchBacktest } from "./agents/pipeline";
import { LIVE_TRADING, PAPER_BROKER, llmProvider } from "./flags";
import { extractJsonObject, NIM_MODEL } from "./llm/nvidia";
import { emptySession, loadSession, upsertSession } from "./store/session";

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

function main() {
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
  assert(result.book.selected.length >= 3, "book too small");
  assert(result.book.equity.length > 10, "equity");
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
  assert(llmProvider() === "mock", "default LLM is mock without NVIDIA_API_KEY");
  assert(NIM_MODEL === "google/gemma-4-31b-it", "NIM model locked to gemma-4-31b-it");
  const extracted = extractJsonObject('noise ```json\n{"expression":"rank(close)"}\n```');
  assert(extracted.includes("rank(close)"), "NIM json fence extract");

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

  const saved = upsertSession(
    {
      extras: [{ id: "A19R1", name: "t", category: "momentum", expression: parent, source: "wq", rationale: "test" }],
      selectedId: "A19R1",
      expression: parent,
      llmUsed: false,
    },
    { at: new Date().toISOString(), kind: "refine", note: "selftest refine", extraIds: ["A19R1"], selectedId: "A19R1" },
  );
  const loaded = loadSession();
  assert(loaded.extras.some((s) => s.id === "A19R1"), "session extras persist");
  assert(loaded.runs.some((r) => r.kind === "refine"), "session runs persist");
  assert(saved.version === 1, "session version");
  upsertSession(emptySession());

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
        sessionExtras: loaded.extras.map((s) => s.id),
      },
      null,
      2,
    ),
  );
}

main();
