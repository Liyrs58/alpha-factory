import { SEED_LIBRARY, CATEGORY_LABEL, TAU, WC, WR } from "../alphas/library";
import { buildPanel, evalExpression, type Panel } from "../alphas/eval";
import { backtestAlpha, fwdReturns, row } from "../backtest/engine";
import { fromReturns, turnoverFromWeights } from "../backtest/stats";
import { l1Normalize, ridge } from "../linalg";
import { mean, pearson, rankData, stdev } from "../rng";
import { scoreAlpha } from "./score";
import type {
  AgentEvent,
  Book,
  Category,
  EvaluatedAlpha,
  PipelineResult,
  Regime,
  RegimeWeights,
  SeedAlpha,
  Universe,
  UniverseMeta,
} from "../types";

function metaOf(universe: Universe, source: UniverseMeta["source"] = "DEMO10"): UniverseMeta {
  return {
    source,
    nS: universe.tickers.length,
    nT: universe.dates.length,
    dates: universe.dates,
    tickers: universe.tickers.map((t) => t.id),
  };
}

const TRAIN_FRACTION = 0.6;
const TEST_FRACTION_START = 0.8;
const REGIME_REFIT_DAYS = 21;
const TRANSACTION_COST_BPS = 10;

function prefixUniverse(universe: Universe, endExclusive: number): Universe {
  const end = Math.max(0, Math.min(universe.dates.length, endExclusive));
  return {
    tickers: universe.tickers,
    dates: universe.dates.slice(0, end),
    regimes: universe.regimes.slice(0, end),
    bars: Object.fromEntries(
      universe.tickers.map(({ id }) => [id, universe.bars[id]!.slice(0, end)]),
    ),
  };
}

const CLOCK = ["09:31:04", "09:31:11", "09:31:19", "09:31:27", "09:31:36", "09:31:48", "09:32:02"];

function stamp(i: number): string {
  return CLOCK[i % CLOCK.length]!;
}

function evaluateOne(panel: Panel, seed: SeedAlpha): EvaluatedAlpha {
  const values = evalExpression(seed.expression, panel);
  const { metrics, equity, daily, deciles } = backtestAlpha(panel, values);
  const scores = scoreAlpha(metrics);
  return { ...seed, metrics, scores, equity, dailyReturns: daily, deciles };
}

function selectBook(evaluated: EvaluatedAlpha[]): EvaluatedAlpha[] {
  const byCat = new Map<Category, EvaluatedAlpha[]>();
  for (const a of evaluated) {
    const list = byCat.get(a.category) ?? [];
    list.push(a);
    byCat.set(a.category, list);
  }
  const picked: EvaluatedAlpha[] = [];
  for (const [, list] of byCat) {
    const ranked = [...list].sort((x, y) => y.scores.final - x.scores.final);
    const best = ranked.filter((a) => a.scores.passed);
    if (best[0]) picked.push(best[0]);
    // Category balance: allow a second MOM/MRV name if it still clears τ
    if (best[1] && (best[0].category === "momentum" || best[0].category === "meanrev")) {
      if (best[1].scores.final > TAU + 0.04) picked.push(best[1]);
    }
  }
  return picked.sort((a, b) => b.scores.final - a.scores.final);
}

function zscoreRow(rowVals: number[]): number[] {
  return rankData(rowVals).map((v) => (Number.isFinite(v) ? (v - 0.5) * 2 : 0));
}

function icSign(a: EvaluatedAlpha): number {
  return a.metrics.ic < 0 ? -1 : 1;
}

function signedAlphas(panel: Panel, selected: EvaluatedAlpha[]): Float64Array[] {
  return selected.map((s) => {
    const raw = evalExpression(s.expression, panel);
    if (icSign(s) === 1) return raw;
    const flipped = new Float64Array(raw.length);
    for (let i = 0; i < raw.length; i++) flipped[i] = -raw[i];
    return flipped;
  });
}

function regimeIc(
  panel: Panel,
  signed: Float64Array[],
  universe: Universe,
): Record<Regime, number[]> {
  const fwd = fwdReturns(panel);
  const acc: Record<Regime, number[][]> = {
    bull: signed.map(() => []),
    bear: signed.map(() => []),
    sideways: signed.map(() => []),
  };
  for (let t = 0; t < panel.nT - 1; t++) {
    const r = universe.regimes[t]!;
    const y = rankData(row(panel, fwd, t));
    for (let j = 0; j < signed.length; j++) {
      const x = rankData(row(panel, signed[j]!, t));
      const ic = pearson(x, y);
      if (Number.isFinite(ic)) acc[r][j]!.push(ic);
    }
  }
  const out: Record<Regime, number[]> = { bull: [], bear: [], sideways: [] };
  (Object.keys(acc) as Regime[]).forEach((r) => {
    out[r] = acc[r].map((xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0));
  });
  return out;
}

function fitRegimeWeights(
  panel: Panel,
  selected: EvaluatedAlpha[],
  universe: Universe,
): RegimeWeights {
  const signed = signedAlphas(panel, selected);
  const fwd = fwdReturns(panel);
  const k = selected.length;
  const buckets: Record<Regime, { X: number[][]; y: number[] }> = {
    bull: { X: [], y: [] },
    bear: { X: [], y: [] },
    sideways: { X: [], y: [] },
  };

  for (let t = 0; t < panel.nT - 1; t++) {
    const regime = universe.regimes[t]!;
    const feats = signed.map((a) => zscoreRow(row(panel, a, t)));
    const yrow = row(panel, fwd, t);
    for (let s = 0; s < panel.nS; s++) {
      const yv = yrow[s]!;
      if (!Number.isFinite(yv)) continue;
      const x: number[] = [];
      let ok = true;
      for (let j = 0; j < k; j++) {
        const v = feats[j]![s];
        if (!Number.isFinite(v)) {
          ok = false;
          break;
        }
        x.push(v);
      }
      if (!ok) continue;
      buckets[regime].X.push(x);
      buckets[regime].y.push(yv);
    }
  }

  const ric = regimeIc(panel, signed, universe);
  const weights: RegimeWeights = {
    bull: Array(k).fill(1 / Math.max(k, 1)),
    bear: Array(k).fill(1 / Math.max(k, 1)),
    sideways: Array(k).fill(1 / Math.max(k, 1)),
  };

  (Object.keys(buckets) as Regime[]).forEach((r) => {
    const prior = l1Normalize(ric[r].map((ic) => Math.max(ic, 0.0001)));
    const { X, y } = buckets[r];
    if (X.length < k + 12) {
      weights[r] = prior;
      return;
    }
    const fitted = l1Normalize(ridge(X, y, 0.8));
    weights[r] = l1Normalize(
      fitted.map((w, i) => 0.45 * w + 0.55 * (prior[i] ?? 0)),
    );
  });

  return weights;
}

export function walkForwardBacktest(
  panel: Panel,
  selected: EvaluatedAlpha[],
  universe: Universe,
): {
  daily: number[];
  benchDaily: number[];
  equity: number[];
  benchEquity: number[];
  weights: RegimeWeights;
  turnover: number;
  ic: number;
  icStd: number;
  evaluationDates: string[];
  holdings: Record<string, number[]>;
  regimePath: Regime[];
  trainingEnd: string;
  testStart: string;
} {
  const nT = panel.nT;
  const trainingEndIdx = Math.floor(nT * TRAIN_FRACTION);
  const testStartIdx = Math.floor(nT * TEST_FRACTION_START);
  if (trainingEndIdx < 2 || testStartIdx <= trainingEndIdx || testStartIdx >= nT - 1) {
    throw new Error("Walk-forward backtest requires enough rows for chronological train, validation, and test periods.");
  }
  const alphas = signedAlphas(panel, selected);
  const fwd = fwdReturns(panel);
  const k = selected.length;
  const daily: number[] = [];
  const benchDaily: number[] = [];
  const turnover: number[] = [];
  const ics: number[] = [];
  const holdings: Record<string, number[]> = {};
  const regimePath: Regime[] = [];
  const latestWeights: RegimeWeights = {
    bull: [], bear: [], sideways: [],
  };
  let prevW: number[] | null = null;

  for (let t = testStartIdx; t < nT - 1; t++) {
    // Refit only at the start of the test and every 21 days, using a prefix
    // that ends at t. Its last usable forward label is t-1 → t, known now.
    if (selected.length > 0 && (t - testStartIdx) % REGIME_REFIT_DAYS === 0) {
      const fitUniverse = prefixUniverse(universe, t + 1);
      latestWeights.bull = [];
      latestWeights.bear = [];
      latestWeights.sideways = [];
      const fitted = fitRegimeWeights(buildPanel(fitUniverse), selected, fitUniverse);
      latestWeights.bull = fitted.bull;
      latestWeights.bear = fitted.bear;
      latestWeights.sideways = fitted.sideways;
    }
    const rowReturns = row(panel, fwd, t);
    if (selected.length === 0) {
      // No training candidate cleared the gate: hold cash instead of turning
      // tied zero signals into an accidental equal-weight long book.
      const cash = new Array<number>(panel.nS).fill(0);
      daily.push(0);
      benchDaily.push(mean(rowReturns.filter(Number.isFinite)));
      turnover.push(0);
      holdings[universe.dates[t]!] = cash;
      regimePath.push(universe.regimes[t]!);
      prevW = cash;
      continue;
    }
    const w = latestWeights[universe.regimes[t]!];
    const signal = new Array<number>(panel.nS).fill(0);
    const rows = alphas.map((a) => zscoreRow(row(panel, a, t)));
    for (let s = 0; s < panel.nS; s++) {
      let v = 0;
      for (let j = 0; j < k; j++) v += (w[j] ?? 0) * (rows[j]![s] ?? 0);
      signal[s] = v;
    }
    const ranked = signal
      .map((v, i) => ({ v, i }))
      .filter((d) => Number.isFinite(d.v))
      .sort((a, b) => b.v - a.v);
    const kLong = Math.min(4, ranked.length);
    if (kLong === 0) continue;
    const target = new Array<number>(panel.nS).fill(0);
    for (let i = 0; i < kLong; i++) target[ranked[i]!.i] = 1 / kLong;
    const ic = pearson(rankData(signal), rankData(rowReturns));
    if (Number.isFinite(ic)) ics.push(ic);
    let grossRet = 0;
    for (let i = 0; i < kLong; i++) {
      const s = ranked[i]!.i;
      const r = fwd[t * panel.nS + s];
      if (Number.isFinite(r)) grossRet += r / kLong;
    }
    const traded = turnoverFromWeights(prevW, target);
    daily.push(grossRet - traded * TRANSACTION_COST_BPS / 10_000);
    benchDaily.push(mean(rowReturns.filter(Number.isFinite)));
    turnover.push(traded);
    holdings[universe.dates[t]!] = target;
    regimePath.push(universe.regimes[t]!);
    prevW = target;
  }
  const bookPath = fromReturns(daily);
  const benchPath = fromReturns(benchDaily);
  const icMean = ics.length ? mean(ics) : 0;
  const icStd = ics.length > 2 ? stdev(ics) : 0;
  bookPath.metrics.ic = icMean;
  bookPath.metrics.icStd = icStd;
  bookPath.metrics.ir = icStd < 1e-12 ? 0 : (icMean / icStd) * Math.sqrt(252);
  bookPath.metrics.tstat = icStd < 1e-12 ? 0 : (icMean / icStd) * Math.sqrt(ics.length);
  bookPath.metrics.turnover = turnover.length ? mean(turnover) : 0;
  return {
    daily,
    benchDaily,
    equity: bookPath.equity,
    benchEquity: benchPath.equity,
    weights: latestWeights,
    turnover: bookPath.metrics.turnover,
    ic: icMean,
    icStd,
    evaluationDates: universe.dates.slice(testStartIdx),
    holdings,
    regimePath,
    trainingEnd: universe.dates[trainingEndIdx - 1]!,
    testStart: universe.dates[testStartIdx]!,
  };
}

export function evaluateSeed(panel: Panel, seed: SeedAlpha): EvaluatedAlpha {
  return evaluateOne(panel, seed);
}

export function runPipelineFromSeeds(
  universe: Universe,
  seeds: SeedAlpha[],
  llmUsed = false,
  meta?: UniverseMeta,
): PipelineResult {
  return runPipelineOn(universe, seeds, llmUsed, meta);
}

export function runPipeline(
  universe: Universe,
  extras: SeedAlpha[] = [],
  llmUsed = false,
  meta?: UniverseMeta,
): PipelineResult {
  return runPipelineOn(universe, [...SEED_LIBRARY, ...extras], llmUsed, meta);
}

function runPipelineOn(
  universe: Universe,
  proposed: SeedAlpha[],
  llmUsed: boolean,
  meta?: UniverseMeta,
): PipelineResult {
  const panel = buildPanel(universe);
  const trainingEndIdx = Math.floor(universe.dates.length * TRAIN_FRACTION);
  const trainingUniverse = prefixUniverse(universe, trainingEndIdx);
  const trainingPanel = buildPanel(trainingUniverse);
  const events: AgentEvent[] = [];
  let tick = 0;

  events.push({
    agent: "proposer",
    t: stamp(tick++),
    body: llmUsed
      ? `LLM/refine path. Evaluating ${proposed.length} formulas (SAF + generated).`
      : `Demo SAF · ${proposed.length} executable seeds from paper taxonomy + LLM-style WQ skeletons.`,
    tone: "info",
  });

  const cats = [...new Set(proposed.map((p) => p.category))];
  events.push({
    agent: "proposer",
    t: stamp(tick++),
    body: `Categories ${cats.map((c) => CATEGORY_LABEL[c]).join(" ")} · wc=${WC} wr=${WR} τ=${TAU}. Emitting formulaic α, not trades.`,
    tone: "info",
  });

  const evaluated = proposed.map((seed) => {
    try {
      return evaluateSeed(trainingPanel, seed);
    } catch (err) {
      const failed: EvaluatedAlpha = {
        ...seed,
        metrics: {
          ic: 0,
          icStd: 0,
          tstat: 0,
          ir: 0,
          sharpe: 0,
          sortino: 0,
          calmar: 0,
          totalReturn: 0,
          annVol: 0,
          maxDrawdown: 0,
          hitRate: 0,
          coverage: 0,
          turnover: 0,
        },
        scores: {
          confidence: 0,
          risk: 0,
          final: 0,
          passed: false,
          criticNote: `parse/eval error: ${err instanceof Error ? err.message : String(err)}`,
        },
        equity: [1],
        dailyReturns: [],
        deciles: Array.from({ length: 10 }, () => 0),
      };
      return failed;
    }
  });

  const selected = selectBook(evaluated);
  const rejected = evaluated.filter((a) => !selected.some((s) => s.id === a.id));

  events.push({
    agent: "critic",
    t: stamp(tick++),
    body: `CSA/RPA on ${evaluated.length} seeds. Category-best with score>τ kept. ${selected.length} pass · ${rejected.length} drop.`,
    tone: "info",
  });

  for (const a of selected.slice(0, 4)) {
    events.push({
      agent: "critic",
      t: stamp(tick++),
      body: `${a.id} ${CATEGORY_LABEL[a.category]}  ${a.expression}\n${a.scores.criticNote}`,
      tone: "pass",
    });
  }
  const worst = [...rejected].sort((a, b) => a.scores.final - b.scores.final)[0];
  if (worst) {
    events.push({
      agent: "critic",
      t: stamp(tick++),
      body: `drop ${worst.id} ${CATEGORY_LABEL[worst.category]}\n${worst.scores.criticNote}`,
      tone: "fail",
    });
  }

  const bookPath = walkForwardBacktest(panel, selected, universe);
  const bookMetrics = fromReturns(bookPath.daily).metrics;
  const benchMetrics = fromReturns(bookPath.benchDaily).metrics;
  bookMetrics.ic = bookPath.ic;
  bookMetrics.icStd = bookPath.icStd;
  bookMetrics.ir = bookPath.icStd < 1e-12 ? 0 : (bookPath.ic / bookPath.icStd) * Math.sqrt(252);
  bookMetrics.tstat = bookPath.icStd < 1e-12 ? 0 : (bookPath.ic / bookPath.icStd) * Math.sqrt(bookPath.daily.length);
  bookMetrics.turnover = bookPath.turnover;

  events.push({
    agent: "backtester",
    t: stamp(tick++),
    body: `${selected.length ? "Walk-forward OOS top-k vs EW" : "No training alpha passed; the book stayed in cash"}. Train through ${bookPath.trainingEnd}; test from ${bookPath.testStart}; regime refit every ${REGIME_REFIT_DAYS}d; costs ${TRANSACTION_COST_BPS}bps one-way.`,
    tone: "info",
  });
  events.push({
    agent: "backtester",
    t: stamp(tick++),
    body: `BOOK  ret=${(bookMetrics.totalReturn * 100).toFixed(1)}%  Sharpe=${bookMetrics.sharpe.toFixed(2)}  mdd=${(bookMetrics.maxDrawdown * 100).toFixed(1)}%  IC=${bookMetrics.ic.toFixed(3)}\nBENCH ret=${(benchMetrics.totalReturn * 100).toFixed(1)}%  Sharpe=${benchMetrics.sharpe.toFixed(2)}`,
    tone: bookMetrics.sharpe >= 0 ? "pass" : "fail",
  });

  const weights = bookPath.weights;
  const share = (r: Regime) =>
    bookPath.regimePath.filter((x) => x === r).length / Math.max(bookPath.regimePath.length, 1);
  const wLine = (r: Regime) =>
    selected
      .map((a, i) => `${a.id}:${(weights[r][i] ?? 0).toFixed(2)}`)
      .join("  ");

  const pmNote = [
    `regime mix  bull ${(share("bull") * 100).toFixed(0)}%  bear ${(share("bear") * 100).toFixed(0)}%  side ${(share("sideways") * 100).toFixed(0)}%`,
    selected.length
      ? `ridge λ=0.8 + IC prior |A|=${selected.length}  (paper MLP stand-in)`
      : "No alpha passed training-only selection; portfolio exposure is zero.",
    `BULL  ${wLine("bull")}`,
    `BEAR  ${wLine("bear")}`,
    `SIDE  ${wLine("sideways")}`,
  ].join("\n");

  events.push({
    agent: "pm",
    t: stamp(tick++),
    body: pmNote,
    tone: "info",
  });

  const book: Book = {
    selected,
    weights,
    equity: bookPath.equity,
    bench: bookPath.benchEquity,
    dailyReturns: bookPath.daily,
    benchReturns: bookPath.benchDaily,
    metrics: bookMetrics,
    benchMetrics,
    regimePath: bookPath.regimePath,
    evaluationDates: bookPath.evaluationDates,
    holdings: bookPath.holdings,
    trainingEnd: bookPath.trainingEnd,
    testStart: bookPath.testStart,
    costBps: TRANSACTION_COST_BPS,
    pmNote,
  };

  return {
    proposed,
    evaluated,
    book,
    events,
    llmUsed,
    universe: meta ?? metaOf(universe),
  };
}

export function scratchBacktest(universe: Universe, expression: string): EvaluatedAlpha {
  const trainEnd = Math.floor(universe.dates.length * TRAIN_FRACTION);
  const panel = buildPanel(prefixUniverse(universe, trainEnd));
  return evaluateOne(panel, {
    id: "SCR",
    name: "scratch",
    category: "technical",
    expression,
    source: "llm",
    rationale: "editor",
  });
}
