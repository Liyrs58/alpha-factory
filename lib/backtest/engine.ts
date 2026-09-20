import { mean, pearson, rankData, stdev } from "../rng";
import type { Panel } from "../alphas/eval";
import { coverage } from "../alphas/eval";
import type { AlphaMetrics } from "../types";
import { fromReturns, turnoverFromWeights } from "./stats";

export type LsConfig = {
  longK: number;
  shortK: number;
};

const DEFAULT_LS: LsConfig = { longK: 3, shortK: 3 };

function row(panel: Panel, arr: Float64Array, t: number): number[] {
  const out = new Array<number>(panel.nS);
  for (let s = 0; s < panel.nS; s++) out[s] = arr[t * panel.nS + s];
  return out;
}

function fwdReturns(panel: Panel): Float64Array {
  const close = panel.fields.close;
  const out = new Float64Array(panel.nT * panel.nS);
  out.fill(NaN);
  for (let s = 0; s < panel.nS; s++) {
    for (let t = 0; t < panel.nT - 1; t++) {
      const p0 = close[t * panel.nS + s];
      const p1 = close[(t + 1) * panel.nS + s];
      out[t * panel.nS + s] = p0 ? p1 / p0 - 1 : NaN;
    }
  }
  return out;
}

function lsWeights(signal: number[], longK: number, shortK: number): number[] {
  const idx = signal
    .map((v, i) => ({ v, i }))
    .filter((d) => Number.isFinite(d.v))
    .sort((a, b) => b.v - a.v);
  const w = new Array<number>(signal.length).fill(0);
  const L = Math.min(longK, idx.length);
  const S = Math.min(shortK, Math.max(0, idx.length - L));
  for (let i = 0; i < L; i++) w[idx[i].i] = 1 / L;
  for (let i = 0; i < S; i++) w[idx[idx.length - 1 - i].i] = -1 / S;
  return w;
}

export function backtestAlpha(
  panel: Panel,
  alpha: Float64Array,
  cfg: LsConfig = DEFAULT_LS,
): { metrics: AlphaMetrics; equity: number[]; daily: number[]; deciles: number[] } {
  const fwd = fwdReturns(panel);
  const ics: number[] = [];
  const daily: number[] = [];
  let prevW: number[] | null = null;
  let toSum = 0;
  let toN = 0;

  for (let t = 0; t < panel.nT - 1; t++) {
    const a = row(panel, alpha, t);
    const r = row(panel, fwd, t);
    const ra = rankData(a);
    const rr = rankData(r);
    const ic = pearson(ra, rr);
    if (Number.isFinite(ic)) ics.push(ic);

    if (!a.some(Number.isFinite)) continue;
    const w = lsWeights(a, cfg.longK, cfg.shortK);
    let ret = 0;
    let used = 0;
    for (let s = 0; s < panel.nS; s++) {
      if (w[s] !== 0 && Number.isFinite(r[s])) {
        ret += w[s] * r[s];
        used++;
      }
    }
    if (used === 0) continue;
    daily.push(ret);
    toSum += turnoverFromWeights(prevW, w);
    toN++;
    prevW = w;
  }

  const { equity, metrics } = fromReturns(daily);
  const icMean = ics.length ? mean(ics) : 0;
  const icStd = ics.length > 2 ? stdev(ics) : 0;
  metrics.ic = icMean;
  metrics.icStd = icStd;
  metrics.ir = icStd < 1e-12 ? 0 : (icMean / icStd) * Math.sqrt(252);
  metrics.tstat = icStd < 1e-12 ? 0 : (icMean / icStd) * Math.sqrt(ics.length);
  metrics.coverage = coverage(alpha);
  metrics.turnover = toN ? toSum / toN : 0;
  return { metrics, equity, daily, deciles: decileMeans(panel, alpha, fwd) };
}

function decileMeans(panel: Panel, alpha: Float64Array, fwd: Float64Array): number[] {
  const sums = Array.from({ length: 10 }, () => 0);
  const cnt = Array.from({ length: 10 }, () => 0);
  for (let t = 0; t < panel.nT - 1; t++) {
    const a = row(panel, alpha, t);
    const r = row(panel, fwd, t);
    const ra = rankData(a);
    for (let s = 0; s < panel.nS; s++) {
      if (!Number.isFinite(ra[s]) || !Number.isFinite(r[s])) continue;
      const b = Math.min(9, Math.max(0, Math.floor(ra[s]! * 10)));
      sums[b]! += r[s]!;
      cnt[b]! += 1;
    }
  }
  return sums.map((s, i) => (cnt[i] ? s / cnt[i]! : 0));
}

export function equalWeightBench(panel: Panel): { equity: number[]; daily: number[] } {
  const fwd = fwdReturns(panel);
  const daily: number[] = [];
  for (let t = 0; t < panel.nT - 1; t++) {
    const r = row(panel, fwd, t).filter(Number.isFinite);
    if (r.length) daily.push(mean(r));
  }
  return { daily, equity: fromReturns(daily).equity };
}

export { fwdReturns, row, lsWeights };
