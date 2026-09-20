import { gaussian, mulberry32 } from "../rng";
import type { Bar, Regime, Ticker, Universe } from "../types";

const SEED = 240906289;

export const TICKERS: Ticker[] = [
  { id: "NRGX", name: "Northridge Energy", sector: "Energy", beta: 1.18 },
  { id: "FINV", name: "Finvale Holdings", sector: "Financials", beta: 1.08 },
  { id: "HLTH", name: "Helix Therapeutics", sector: "Health", beta: 0.92 },
  { id: "INDS", name: "Industek", sector: "Industrials", beta: 1.12 },
  { id: "CONS", name: "Constant Staples", sector: "Staples", beta: 0.64 },
  { id: "TECH", name: "Tectra Systems", sector: "Technology", beta: 1.34 },
  { id: "UTIL", name: "Umbra Utilities", sector: "Utilities", beta: 0.51 },
  { id: "MATL", name: "Marrow Materials", sector: "Materials", beta: 1.21 },
  { id: "REAL", name: "Redland REIT", sector: "Real Estate", beta: 0.88 },
  { id: "DISC", name: "Discant Retail", sector: "Discretionary", beta: 1.16 },
];

function tradingDays(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  while (cur <= end) {
    const dow = cur.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

function regimeAt(t: number, n: number): Regime {
  const p = t / Math.max(n - 1, 1);
  if (p < 0.2) return "bull";
  if (p < 0.38) return "bear";
  if (p < 0.58) return "sideways";
  if (p < 0.74) return "bear";
  return "bull";
}

function regimeParams(r: Regime): { mu: number; sigma: number } {
  switch (r) {
    case "bull":
      return { mu: 0.16 / 252, sigma: 0.13 / Math.sqrt(252) };
    case "bear":
      return { mu: -0.14 / 252, sigma: 0.26 / Math.sqrt(252) };
    case "sideways":
      return { mu: 0.02 / 252, sigma: 0.11 / Math.sqrt(252) };
  }
}

function buildUniverse(): Universe {
  const rng = mulberry32(SEED);
  const dates = tradingDays("2019-01-02", "2024-12-31");
  const nT = dates.length;
  const nS = TICKERS.length;
  const regimes = dates.map((_, t) => regimeAt(t, nT));

  const mkt: number[] = new Array(nT);
  mkt[0] = 100;
  for (let t = 1; t < nT; t++) {
    const { mu, sigma } = regimeParams(regimes[t]);
    mkt[t] = mkt[t - 1] * Math.exp(mu + sigma * gaussian(rng));
  }

  const closes: number[][] = TICKERS.map((tk) => {
    const px = new Array<number>(nT);
    px[0] = 25 + rng() * 90;
    for (let t = 1; t < nT; t++) {
      const { sigma } = regimeParams(regimes[t]);
      const mktRet = Math.log(mkt[t] / mkt[t - 1]);
      const idio = (0.55 * sigma) / Math.max(tk.beta, 0.4);
      px[t] = px[t - 1] * Math.exp(tk.beta * mktRet + idio * gaussian(rng));
    }
    return px;
  });

  const volumes: number[][] = TICKERS.map(() => {
    const v = new Array<number>(nT);
    const base = 4e5 + rng() * 2.4e6;
    for (let t = 0; t < nT; t++) {
      v[t] = base * Math.exp(0.35 * gaussian(rng));
    }
    return v;
  });

  // Plant cross-sectional structure so formulaic alphas have measurable IC.
  // Next-day residual return depends on 14d momentum (bull), distance-from-SMA
  // (sideways mean-reversion), and inverse volume rank (liquidity).
  for (let t = 20; t < nT - 1; t++) {
    const mom: number[] = [];
    const dist: number[] = [];
    const vol: number[] = [];
    for (let s = 0; s < nS; s++) {
      mom.push(closes[s][t] / closes[s][t - 14] - 1);
      let sma = 0;
      for (let k = 0; k < 20; k++) sma += closes[s][t - k];
      sma /= 20;
      dist.push(closes[s][t] / sma - 1);
      vol.push(volumes[s][t]);
    }
    const z = (xs: number[]) => {
      const m = xs.reduce((a, b) => a + b, 0) / xs.length;
      const sd = Math.sqrt(
        xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(xs.length - 1, 1),
      );
      return xs.map((x) => (sd < 1e-12 ? 0 : (x - m) / sd));
    };
    const zm = z(mom);
    const zd = z(dist);
    const zv = z(vol);
    const r = regimes[t];
    for (let s = 0; s < nS; s++) {
      let extra = -0.00045 * zv[s];
      if (r === "bull") extra += 0.00115 * zm[s];
      if (r === "bear") extra += -0.00055 * zm[s] + 0.00085 * Math.abs(zd[s]);
      if (r === "sideways") extra += -0.00165 * zd[s];
      extra += 0.00012 * gaussian(rng);
      closes[s][t + 1] *= Math.exp(extra);
    }
  }

  const bars: Record<string, Bar[]> = {};
  TICKERS.forEach((tk, s) => {
    bars[tk.id] = dates.map((date, t) => {
      const c = closes[s][t];
      const prev = t === 0 ? c : closes[s][t - 1];
      const gap = 0.002 + 0.006 * Math.abs(gaussian(rng));
      const open = prev * (1 + (rng() - 0.48) * gap);
      const span = Math.abs(gaussian(rng)) * 0.012 * c;
      const high = Math.max(open, c) + span * (0.3 + rng());
      const low = Math.min(open, c) - span * (0.3 + rng());
      const volume = Math.max(1e4, volumes[s][t]);
      const vwap = (high + low + c) / 3;
      return { date, open, high, low: Math.max(0.5, low), close: c, volume, vwap };
    });
  });

  return { tickers: TICKERS, dates, bars, regimes };
}

export const UNIVERSE: Universe = buildUniverse();

export function marketPath(universe: Universe): number[] {
  const nT = universe.dates.length;
  const nS = universe.tickers.length;
  const eq: number[] = new Array(nT);
  for (let t = 0; t < nT; t++) {
    let s = 0;
    for (const tk of universe.tickers) s += universe.bars[tk.id][t].close;
    eq[t] = s / nS;
  }
  const z0 = eq[0];
  return eq.map((v) => v / z0);
}
