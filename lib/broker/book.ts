import { buildPanel, evalExpression, type Panel } from "../alphas/eval";
import { row } from "../backtest/engine";
import { rankData } from "../rng";
import type { Book, Universe } from "../types";
import type { PaperOrder } from "./alpaca";

function zscoreRow(rowVals: number[]): number[] {
  return rankData(rowVals).map((v) => (Number.isFinite(v) ? (v - 0.5) * 2 : 0));
}

function icSign(ic: number): number {
  return ic < 0 ? -1 : 1;
}

/**
 * Last complete session of the research book: equal-weight top-4 longs.
 * Never used for live orders.
 */
export function researchBookOrders(universe: Universe, book: Book, qty = 1): PaperOrder[] {
  const selected = book.selected;
  if (!selected.length) return [];
  const panel: Panel = buildPanel(universe);
  const t = panel.nT - 2;
  if (t < 0) return [];
  const regime = universe.regimes[t] ?? "sideways";
  const w = book.weights[regime];
  const alphas = selected.map((s) => {
    const raw = evalExpression(s.expression, panel);
    if (icSign(s.metrics.ic) === 1) return raw;
    const flipped = new Float64Array(raw.length);
    for (let i = 0; i < raw.length; i++) flipped[i] = -raw[i];
    return flipped;
  });
  const signal = new Array<number>(panel.nS).fill(0);
  const rows = alphas.map((a) => zscoreRow(row(panel, a, t)));
  for (let s = 0; s < panel.nS; s++) {
    let v = 0;
    for (let j = 0; j < selected.length; j++) v += (w[j] ?? 0) * (rows[j]![s] ?? 0);
    signal[s] = v;
  }
  const ranked = signal
    .map((v, i) => ({ v, i }))
    .filter((d) => Number.isFinite(d.v))
    .sort((a, b) => b.v - a.v);
  const kLong = Math.min(4, ranked.length);
  const q = Math.max(1, Math.floor(qty));
  const out: PaperOrder[] = [];
  for (let i = 0; i < kLong; i++) {
    const ticker = universe.tickers[ranked[i]!.i]?.id;
    if (!ticker) continue;
    out.push({ symbol: ticker, side: "buy", qty: q, type: "market" });
  }
  return out;
}
