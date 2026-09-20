import { pearson, rankData } from "../rng";
import type { AstNode, Universe } from "../types";
import { parse } from "./parser";

export type Panel = {
  nT: number;
  nS: number;
  ids: string[];
  fields: Record<string, Float64Array>;
};

function idx(t: number, s: number, nS: number): number {
  return t * nS + s;
}

function alloc(n: number, fill = NaN): Float64Array {
  const a = new Float64Array(n);
  a.fill(fill);
  return a;
}

function rolling(
  src: Float64Array,
  nT: number,
  nS: number,
  window: number,
  fn: (buf: number[], len: number) => number,
): Float64Array {
  const out = alloc(nT * nS);
  const w = Math.max(1, Math.floor(window));
  const buf = new Array<number>(w);
  for (let s = 0; s < nS; s++) {
    for (let t = 0; t < nT; t++) {
      if (t + 1 < w) continue;
      let len = 0;
      for (let k = 0; k < w; k++) {
        const v = src[idx(t - w + 1 + k, s, nS)];
        if (Number.isFinite(v)) buf[len++] = v;
      }
      if (len === 0) continue;
      out[idx(t, s, nS)] = fn(buf, len);
    }
  }
  return out;
}

function delay(src: Float64Array, nT: number, nS: number, d: number): Float64Array {
  const out = alloc(nT * nS);
  const dd = Math.max(0, Math.floor(d));
  for (let s = 0; s < nS; s++) {
    for (let t = dd; t < nT; t++) out[idx(t, s, nS)] = src[idx(t - dd, s, nS)];
  }
  return out;
}

function tsRank(src: Float64Array, nT: number, nS: number, window: number): Float64Array {
  const out = alloc(nT * nS);
  const w = Math.max(2, Math.floor(window));
  const buf = new Array<number>(w);
  for (let s = 0; s < nS; s++) {
    for (let t = w - 1; t < nT; t++) {
      for (let k = 0; k < w; k++) buf[k] = src[idx(t - w + 1 + k, s, nS)];
      const last = buf[w - 1];
      if (!Number.isFinite(last)) continue;
      let below = 0;
      let valid = 0;
      for (let k = 0; k < w; k++) {
        if (!Number.isFinite(buf[k])) continue;
        valid++;
        if (buf[k] < last) below++;
      }
      out[idx(t, s, nS)] = valid <= 1 ? 0.5 : below / (valid - 1);
    }
  }
  return out;
}

function csOp(
  src: Float64Array,
  nT: number,
  nS: number,
  fn: (row: number[]) => number[],
): Float64Array {
  const out = alloc(nT * nS);
  const row = new Array<number>(nS);
  for (let t = 0; t < nT; t++) {
    for (let s = 0; s < nS; s++) row[s] = src[idx(t, s, nS)];
    const r = fn(row);
    for (let s = 0; s < nS; s++) out[idx(t, s, nS)] = r[s];
  }
  return out;
}

function binEl(a: Float64Array, b: Float64Array, op: (x: number, y: number) => number): Float64Array {
  const out = alloc(a.length);
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    out[i] = Number.isFinite(x) && Number.isFinite(y) ? op(x, y) : NaN;
  }
  return out;
}

function unEl(a: Float64Array, op: (x: number) => number): Float64Array {
  const out = alloc(a.length);
  for (let i = 0; i < a.length; i++) out[i] = Number.isFinite(a[i]) ? op(a[i]) : NaN;
  return out;
}

function asNum(node: AstNode): number {
  if (node.type !== "num") throw new Error("expected numeric argument");
  return node.value;
}

function meanBuf(buf: number[], len: number): number {
  let s = 0;
  for (let i = 0; i < len; i++) s += buf[i];
  return s / len;
}

function stdBuf(buf: number[], len: number): number {
  if (len < 2) return 0;
  const m = meanBuf(buf, len);
  let s = 0;
  for (let i = 0; i < len; i++) s += (buf[i] - m) ** 2;
  return Math.sqrt(s / (len - 1));
}

function emaArr(src: Float64Array, nT: number, nS: number, span: number): Float64Array {
  const out = alloc(nT * nS);
  const a = 2 / (Math.max(span, 1) + 1);
  for (let s = 0; s < nS; s++) {
    let e = NaN;
    for (let t = 0; t < nT; t++) {
      const v = src[idx(t, s, nS)];
      if (!Number.isFinite(v)) continue;
      e = Number.isFinite(e) ? a * v + (1 - a) * e : v;
      out[idx(t, s, nS)] = e;
    }
  }
  return out;
}

function corrRoll(
  x: Float64Array,
  y: Float64Array,
  nT: number,
  nS: number,
  window: number,
): Float64Array {
  const out = alloc(nT * nS);
  const w = Math.max(3, Math.floor(window));
  const ax = new Array<number>(w);
  const ay = new Array<number>(w);
  for (let s = 0; s < nS; s++) {
    for (let t = w - 1; t < nT; t++) {
      for (let k = 0; k < w; k++) {
        ax[k] = x[idx(t - w + 1 + k, s, nS)];
        ay[k] = y[idx(t - w + 1 + k, s, nS)];
      }
      out[idx(t, s, nS)] = pearson(ax, ay);
    }
  }
  return out;
}

function rsiWilder(close: Float64Array, nT: number, nS: number, n: number): Float64Array {
  const out = alloc(nT * nS);
  const p = Math.max(2, Math.floor(n));
  for (let s = 0; s < nS; s++) {
    let avgG = 0;
    let avgL = 0;
    let ready = false;
    for (let t = 1; t < nT; t++) {
      const ch = close[idx(t, s, nS)] - close[idx(t - 1, s, nS)];
      const g = Math.max(ch, 0);
      const l = Math.max(-ch, 0);
      if (t <= p) {
        avgG += g;
        avgL += l;
        if (t === p) {
          avgG /= p;
          avgL /= p;
          ready = true;
        }
      } else if (ready) {
        avgG = (avgG * (p - 1) + g) / p;
        avgL = (avgL * (p - 1) + l) / p;
      }
      if (ready) {
        const rs = avgL < 1e-12 ? 100 : avgG / avgL;
        out[idx(t, s, nS)] = 100 - 100 / (1 + rs);
      }
    }
  }
  return out;
}

function atrWilder(
  high: Float64Array,
  low: Float64Array,
  close: Float64Array,
  nT: number,
  nS: number,
  n: number,
): Float64Array {
  const out = alloc(nT * nS);
  const p = Math.max(2, Math.floor(n));
  for (let s = 0; s < nS; s++) {
    let atr = 0;
    let ready = false;
    for (let t = 1; t < nT; t++) {
      const h = high[idx(t, s, nS)];
      const l = low[idx(t, s, nS)];
      const pc = close[idx(t - 1, s, nS)];
      const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
      if (t <= p) {
        atr += tr;
        if (t === p) {
          atr /= p;
          ready = true;
        }
      } else if (ready) {
        atr = (atr * (p - 1) + tr) / p;
      }
      if (ready) out[idx(t, s, nS)] = atr;
    }
  }
  return out;
}

export function buildPanel(universe: Universe): Panel {
  const ids = universe.tickers.map((t) => t.id);
  const nS = ids.length;
  const nT = universe.dates.length;
  const n = nT * nS;
  const open = alloc(n);
  const high = alloc(n);
  const low = alloc(n);
  const close = alloc(n);
  const volume = alloc(n);
  const vwap = alloc(n);
  for (let s = 0; s < nS; s++) {
    const series = universe.bars[ids[s]];
    for (let t = 0; t < nT; t++) {
      const b = series[t];
      const i = idx(t, s, nS);
      open[i] = b.open;
      high[i] = b.high;
      low[i] = b.low;
      close[i] = b.close;
      volume[i] = b.volume;
      vwap[i] = b.vwap;
    }
  }
  const returns = alloc(n);
  for (let s = 0; s < nS; s++) {
    for (let t = 1; t < nT; t++) {
      const prev = close[idx(t - 1, s, nS)];
      returns[idx(t, s, nS)] = prev ? close[idx(t, s, nS)] / prev - 1 : NaN;
    }
  }
  const typical = alloc(n);
  for (let i = 0; i < n; i++) typical[i] = (high[i] + low[i] + close[i]) / 3;

  const sma20 = rolling(close, nT, nS, 20, meanBuf);
  const std20 = rolling(close, nT, nS, 20, stdBuf);
  const boll_up = alloc(n);
  const boll_down = alloc(n);
  for (let i = 0; i < n; i++) {
    boll_up[i] = sma20[i] + 2 * std20[i];
    boll_down[i] = sma20[i] - 2 * std20[i];
  }
  const ema12 = emaArr(close, nT, nS, 12);
  const ema26 = emaArr(close, nT, nS, 26);
  const macd = binEl(ema12, ema26, (a, b) => a - b);

  return {
    nT,
    nS,
    ids,
    fields: {
      open,
      high,
      low,
      close,
      volume,
      vwap,
      returns,
      typical,
      rsi: rsiWilder(close, nT, nS, 14),
      atr: atrWilder(high, low, close, nT, nS, 14),
      boll_up,
      boll_down,
      macd,
    },
  };
}

function lit(panel: Panel, value: number): Float64Array {
  const a = alloc(panel.nT * panel.nS, value);
  return a;
}

const FN_ALIAS: Record<string, string> = {
  delay: "delay",
  ref: "delay",
  ts_delay: "delay",
  delta: "ts_delta",
  ts_delta: "ts_delta",
  sma: "ts_mean",
  ma: "ts_mean",
  mean: "ts_mean",
  ts_mean: "ts_mean",
  avg: "ts_mean",
  std: "ts_std",
  stddev: "ts_std",
  ts_std: "ts_std",
  ts_sum: "ts_sum",
  sum: "ts_sum",
  ts_max: "ts_max",
  max: "ts_max",
  ts_min: "ts_min",
  min: "ts_min",
  ts_rank: "ts_rank",
  rank: "rank",
  scale: "scale",
  zscore: "zscore",
  cs_zscore: "zscore",
  abs: "abs",
  log: "log",
  sign: "sign",
  sqrt: "sqrt",
  signedpower: "signedpower",
  correlation: "correlation",
  corr: "correlation",
  ema: "ema",
  rsi: "rsi",
  atr: "atr",
  if: "if",
  ts_argmax: "ts_max",
  decay_linear: "ts_mean",
};

function evalNode(node: AstNode, panel: Panel): Float64Array {
  const { nT, nS } = panel;
  switch (node.type) {
    case "num":
      return lit(panel, node.value);
    case "field": {
      const f = panel.fields[node.name];
      if (!f) throw new Error(`unknown field '${node.name}'`);
      return f;
    }
    case "un":
      return unEl(evalNode(node.arg, panel), (x) => -x);
    case "bin": {
      const L = evalNode(node.left, panel);
      const R = evalNode(node.right, panel);
      switch (node.op) {
        case "+":
          return binEl(L, R, (a, b) => a + b);
        case "-":
          return binEl(L, R, (a, b) => a - b);
        case "*":
          return binEl(L, R, (a, b) => a * b);
        case "/":
          return binEl(L, R, (a, b) => (Math.abs(b) < 1e-12 ? NaN : a / b));
        case "^":
          return binEl(L, R, (a, b) => Math.pow(a, b));
        case ">":
          return binEl(L, R, (a, b) => (a > b ? 1 : 0));
        case "<":
          return binEl(L, R, (a, b) => (a < b ? 1 : 0));
        case ">=":
          return binEl(L, R, (a, b) => (a >= b ? 1 : 0));
        case "<=":
          return binEl(L, R, (a, b) => (a <= b ? 1 : 0));
        case "==":
          return binEl(L, R, (a, b) => (Math.abs(a - b) < 1e-9 ? 1 : 0));
      }
      break;
    }
    case "call": {
      const fn = FN_ALIAS[node.name] ?? node.name;
      const args = node.args;
      const num = (i: number, dflt?: number) => {
        if (!args[i]) {
          if (dflt !== undefined) return dflt;
          throw new Error(`${fn}: missing arg ${i}`);
        }
        return asNum(args[i]);
      };
      const ser = (i: number) => {
        if (!args[i]) throw new Error(`${fn}: missing series ${i}`);
        return evalNode(args[i], panel);
      };

      switch (fn) {
        case "delay":
          return delay(ser(0), nT, nS, num(1, 1));
        case "ts_delta":
          return binEl(ser(0), delay(ser(0), nT, nS, num(1, 1)), (a, b) => a - b);
        case "ts_mean":
          return rolling(ser(0), nT, nS, num(1, 20), meanBuf);
        case "ts_std":
          return rolling(ser(0), nT, nS, num(1, 20), stdBuf);
        case "ts_sum":
          return rolling(ser(0), nT, nS, num(1, 20), (buf, len) => {
            let s = 0;
            for (let i = 0; i < len; i++) s += buf[i];
            return s;
          });
        case "ts_max": {
          if (args.length >= 2 && args[1].type === "num") {
            return rolling(ser(0), nT, nS, num(1), (buf, len) => {
              let m = -Infinity;
              for (let i = 0; i < len; i++) m = Math.max(m, buf[i]);
              return m;
            });
          }
          if (args.length === 2) return binEl(ser(0), ser(1), Math.max);
          return rolling(ser(0), nT, nS, 20, (buf, len) => Math.max(...buf.slice(0, len)));
        }
        case "ts_min": {
          if (args.length >= 2 && args[1].type === "num") {
            return rolling(ser(0), nT, nS, num(1), (buf, len) => {
              let m = Infinity;
              for (let i = 0; i < len; i++) m = Math.min(m, buf[i]);
              return m;
            });
          }
          if (args.length === 2) return binEl(ser(0), ser(1), Math.min);
          return rolling(ser(0), nT, nS, 20, (buf, len) => Math.min(...buf.slice(0, len)));
        }
        case "ts_rank":
          return tsRank(ser(0), nT, nS, num(1, 10));
        case "rank":
          return csOp(ser(0), nT, nS, rankData);
        case "zscore":
          return csOp(ser(0), nT, nS, (row) => {
            const xs = row.filter(Number.isFinite);
            if (xs.length < 3) return row.map(() => NaN);
            const m = xs.reduce((a, b) => a + b, 0) / xs.length;
            const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
            return row.map((v) => (Number.isFinite(v) && sd > 1e-12 ? (v - m) / sd : NaN));
          });
        case "scale":
          return csOp(ser(0), nT, nS, (row) => {
            let s = 0;
            for (const v of row) if (Number.isFinite(v)) s += Math.abs(v);
            if (s < 1e-12) return row.map(() => NaN);
            return row.map((v) => (Number.isFinite(v) ? v / s : NaN));
          });
        case "abs":
          return unEl(ser(0), Math.abs);
        case "log":
          return unEl(ser(0), (x) => (x > 0 ? Math.log(x) : NaN));
        case "sign":
          return unEl(ser(0), Math.sign);
        case "sqrt":
          return unEl(ser(0), (x) => (x >= 0 ? Math.sqrt(x) : NaN));
        case "signedpower": {
          const x = ser(0);
          const p = num(1, 2);
          return unEl(x, (v) => Math.sign(v) * Math.pow(Math.abs(v), p));
        }
        case "correlation":
          return corrRoll(ser(0), ser(1), nT, nS, num(2, 10));
        case "ema":
          return emaArr(ser(0), nT, nS, num(1, 20));
        case "rsi": {
          if (args.length === 0) return panel.fields.rsi;
          if (args.length === 1 && args[0].type === "num") {
            return rsiWilder(panel.fields.close, nT, nS, num(0));
          }
          const series = args.length >= 2 ? ser(0) : panel.fields.close;
          const n = args.length >= 2 ? num(1) : args[0].type === "num" ? num(0) : 14;
          return rsiWilder(series, nT, nS, n);
        }
        case "atr":
          if (args.length === 0 || (args.length === 1 && args[0].type === "num")) {
            const n = args.length ? num(0) : 14;
            return atrWilder(panel.fields.high, panel.fields.low, panel.fields.close, nT, nS, n);
          }
          return panel.fields.atr;
        case "if": {
          const c = ser(0);
          const a = ser(1);
          const b = ser(2);
          const out = alloc(c.length);
          for (let i = 0; i < c.length; i++) {
            const cond = c[i];
            out[i] = Number.isFinite(cond) ? (cond > 0 ? a[i] : b[i]) : NaN;
          }
          return out;
        }
        default:
          throw new Error(`unknown function '${node.name}'`);
      }
    }
  }
  throw new Error("unreachable");
}

export function evalExpression(src: string, panel: Panel): Float64Array {
  return evalNode(parse(src), panel);
}

export function coverage(values: Float64Array): number {
  let ok = 0;
  for (let i = 0; i < values.length; i++) if (Number.isFinite(values[i])) ok++;
  return ok / values.length;
}
