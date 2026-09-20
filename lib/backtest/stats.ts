import { mean, stdev } from "../rng";
import type { AlphaMetrics } from "../types";

const ANN = 252;

export function maxDrawdown(equity: number[]): number {
  let peak = -Infinity;
  let mdd = 0;
  for (const v of equity) {
    if (!Number.isFinite(v)) continue;
    peak = Math.max(peak, v);
    if (peak > 0) mdd = Math.min(mdd, v / peak - 1);
  }
  return mdd;
}

export function fromReturns(daily: number[]): { equity: number[]; metrics: AlphaMetrics } {
  const equity: number[] = [1];
  let nav = 1;
  for (const r of daily) {
    nav *= 1 + (Number.isFinite(r) ? r : 0);
    equity.push(nav);
  }
  return { equity, metrics: metricsFromReturns(daily, equity) };
}

export function metricsFromReturns(daily: number[], equity: number[]): AlphaMetrics {
  const xs = daily.filter(Number.isFinite);
  const m = mean(xs);
  const sd = stdev(xs);
  const downside = xs.filter((r) => r < 0);
  const dsd = stdev(downside.length > 1 ? downside : [0, 0]);
  const totalReturn = equity.length ? equity[equity.length - 1] / equity[0] - 1 : 0;
  const years = Math.max(xs.length / ANN, 1e-9);
  const cagr = Math.pow(1 + totalReturn, 1 / years) - 1;
  const annVol = sd * Math.sqrt(ANN);
  const sharpe = sd < 1e-12 ? 0 : (m / sd) * Math.sqrt(ANN);
  const sortino = dsd < 1e-12 ? 0 : (m / dsd) * Math.sqrt(ANN);
  const mdd = maxDrawdown(equity);
  const calmar = Math.abs(mdd) < 1e-6 ? 0 : cagr / Math.abs(mdd);
  const hitRate = xs.length ? xs.filter((r) => r > 0).length / xs.length : 0;
  return {
    ic: 0,
    icStd: 0,
    tstat: 0,
    ir: 0,
    sharpe,
    sortino,
    calmar,
    totalReturn,
    annVol,
    maxDrawdown: mdd,
    hitRate,
    coverage: 1,
    turnover: 0,
  };
}

export function turnoverFromWeights(prev: number[] | null, next: number[]): number {
  if (!prev) return next.reduce((s, w) => s + Math.abs(w), 0) * 0.5;
  let s = 0;
  for (let i = 0; i < next.length; i++) s += Math.abs((next[i] ?? 0) - (prev[i] ?? 0));
  return s * 0.5;
}
