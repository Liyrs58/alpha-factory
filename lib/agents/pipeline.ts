import { SEED_LIBRARY, CATEGORY_LABEL, TAU, WC, WR } from "../alphas/library";
import { buildPanel, evalExpression, type Panel } from "../alphas/eval";
import { backtestAlpha, equalWeightBench, fwdReturns, row } from "../backtest/engine";
import { fromReturns } from "../backtest/stats";
import { l1Normalize, ridge } from "../linalg";
import { pearson, rankData } from "../rng";
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

function compositeBacktest(
  panel: Panel,
  selected: EvaluatedAlpha[],
  weights: RegimeWeights,
  universe: Universe,
): { daily: number[]; equity: number[] } {
  const alphas = signedAlphas(panel, selected);
  const fwd = fwdReturns(panel);
  const daily: number[] = [];
  const k = selected.length;

  for (let t = 0; t < panel.nT - 1; t++) {
    const w = weights[universe.regimes[t]!];
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
    let ret = 0;
    for (let i = 0; i < kLong; i++) {
      const s = ranked[i]!.i;
      const r = fwd[t * panel.nS + s];
      if (Number.isFinite(r)) ret += r / kLong;
    }
    daily.push(ret);
  }
  return { daily, equity: fromReturns(daily).equity };
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
      return evaluateSeed(panel, seed);
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

  const weights = fitRegimeWeights(panel, selected, universe);
  const bookPath = compositeBacktest(panel, selected, weights, universe);
  const bench = equalWeightBench(panel);
  const bookMetrics = fromReturns(bookPath.daily).metrics;
  const benchMetrics = fromReturns(bench.daily).metrics;

  // Attach IC of the composite via a synthetic alpha = weighted zscores last-pass already in returns
  const combo = backtestAlpha(
    panel,
    (() => {
      const alphas = signedAlphas(panel, selected);
      const out = new Float64Array(panel.nT * panel.nS);
      for (let t = 0; t < panel.nT; t++) {
        const w = weights[universe.regimes[t]!];
        const rows = alphas.map((a) => zscoreRow(row(panel, a, t)));
        for (let s = 0; s < panel.nS; s++) {
          let v = 0;
          for (let j = 0; j < selected.length; j++) v += (w[j] ?? 0) * (rows[j]![s] ?? 0);
          out[t * panel.nS + s] = v;
        }
      }
      return out;
    })(),
    { longK: 4, shortK: 0 },
  );
  bookMetrics.ic = combo.metrics.ic;
  bookMetrics.ir = combo.metrics.ir;
  bookMetrics.coverage = combo.metrics.coverage;
  bookMetrics.turnover = combo.metrics.turnover;

  events.push({
    agent: "backtester",
    t: stamp(tick++),
    body: `LS/top-k book vs EW universe. Hold=1d  k=4  n=${universe.tickers.length}  T=${universe.dates.length}`,
    tone: "info",
  });
  events.push({
    agent: "backtester",
    t: stamp(tick++),
    body: `BOOK  ret=${(bookMetrics.totalReturn * 100).toFixed(1)}%  Sharpe=${bookMetrics.sharpe.toFixed(2)}  mdd=${(bookMetrics.maxDrawdown * 100).toFixed(1)}%  IC=${bookMetrics.ic.toFixed(3)}\nBENCH ret=${(benchMetrics.totalReturn * 100).toFixed(1)}%  Sharpe=${benchMetrics.sharpe.toFixed(2)}`,
    tone: bookMetrics.sharpe >= 0 ? "pass" : "fail",
  });

  const share = (r: Regime) =>
    universe.regimes.filter((x) => x === r).length / universe.regimes.length;
  const wLine = (r: Regime) =>
    selected
      .map((a, i) => `${a.id}:${(weights[r][i] ?? 0).toFixed(2)}`)
      .join("  ");

  const pmNote = [
    `regime mix  bull ${(share("bull") * 100).toFixed(0)}%  bear ${(share("bear") * 100).toFixed(0)}%  side ${(share("sideways") * 100).toFixed(0)}%`,
    `ridge |A|=${selected.length}  λ=0.35  (paper MLP |A|→10→1, demo stand-in)`,
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
    bench: bench.equity,
    dailyReturns: bookPath.daily,
    benchReturns: bench.daily,
    metrics: bookMetrics,
    benchMetrics,
    regimePath: universe.regimes,
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
  const panel = buildPanel(universe);
  return evaluateOne(panel, {
    id: "SCR",
    name: "scratch",
    category: "technical",
    expression,
    source: "llm",
    rationale: "editor",
  });
}
