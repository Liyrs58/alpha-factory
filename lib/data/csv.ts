import type { Bar, Regime, Ticker, Universe } from "../types";

export type CsvParseError = { ok: false; message: string };
export type CsvParseOk = { ok: true; universe: Universe };

const MAX_ROWS = 80_000;
const MAX_NAMES = 40;
const MIN_DAYS = 60;

function inferRegime(dates: string[], bars: Record<string, Bar[]>): Regime[] {
  const ids = Object.keys(bars);
  const nT = dates.length;
  const mkt: number[] = [];
  for (let t = 0; t < nT; t++) {
    let s = 0;
    let n = 0;
    for (const id of ids) {
      const c = bars[id]?.[t]?.close;
      if (c) {
        s += c;
        n++;
      }
    }
    mkt.push(n ? s / n : t === 0 ? 1 : mkt[t - 1]!);
  }
  return dates.map((_, t) => {
    const look = Math.min(t, 60);
    if (look < 10) return "sideways";
    const r = mkt[t]! / mkt[t - look]! - 1;
    if (r > 0.06) return "bull";
    if (r < -0.06) return "bear";
    return "sideways";
  });
}

/** CSV: date,ticker,open,high,low,close,volume[,vwap] */
export function universeFromCsv(text: string): CsvParseOk | CsvParseError {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < MIN_DAYS) return { ok: false; message: `need ≥${MIN_DAYS} rows` };
  if (lines.length > MAX_ROWS) return { ok: false, message: `too many rows (${lines.length})` };

  const header = lines[0]!.toLowerCase().split(/[,;\t]/).map((h) => h.trim());
  const idx = (name: string) => header.indexOf(name);
  const iDate = idx("date");
  const iTk = idx("ticker") >= 0 ? idx("ticker") : idx("symbol");
  const iO = idx("open");
  const iH = idx("high");
  const iL = idx("low");
  const iC = idx("close");
  const iV = idx("volume");
  const iW = idx("vwap");
  if ([iDate, iTk, iO, iH, iL, iC, iV].some((i) => i < 0)) {
    return { ok: false, message: "header must include date,ticker,open,high,low,close,volume" };
  }

  const byName = new Map<string, Bar[]>();
  for (const line of lines.slice(1)) {
    const cols = line.split(/[,;\t]/);
    const ticker = (cols[iTk] ?? "").trim().toUpperCase();
    const date = (cols[iDate] ?? "").slice(0, 10);
    const open = Number(cols[iO]);
    const high = Number(cols[iH]);
    const low = Number(cols[iL]);
    const close = Number(cols[iC]);
    const volume = Number(cols[iV]);
    if (!ticker || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (![open, high, low, close, volume].every(Number.isFinite)) continue;
    const vwap = iW >= 0 && Number.isFinite(Number(cols[iW])) ? Number(cols[iW]) : (high + low + close) / 3;
    const list = byName.get(ticker) ?? [];
    list.push({ date, open, high, low, close, volume, vwap });
    byName.set(ticker, list);
  }

  if (byName.size < 2) return { ok: false, message: "need ≥2 tickers" };
  if (byName.size > MAX_NAMES) return { ok: false, message: `too many tickers (${byName.size})` };

  const dateSet = new Set<string>();
  for (const rows of byName.values()) for (const b of rows) dateSet.add(b.date);
  const dates = [...dateSet].sort();
  if (dates.length < MIN_DAYS) return { ok: false, message: `need ≥${MIN_DAYS} distinct dates` };

  const tickers: Ticker[] = [...byName.keys()].sort().map((id) => ({
    id,
    name: id,
    sector: "upload",
    beta: 1,
  }));

  const bars: Record<string, Bar[]> = {};
  for (const tk of tickers) {
    const map = new Map((byName.get(tk.id) ?? []).map((b) => [b.date, b]));
    bars[tk.id] = dates.map((d) => {
      const hit = map.get(d);
      if (hit) return hit;
      const prev = bars[tk.id]?.[bars[tk.id].length - 1];
      const px = prev?.close ?? 1;
      return { date: d, open: px, high: px, low: px, close: px, volume: 0, vwap: px };
    });
  }

  return {
    ok: true,
    universe: {
      tickers,
      dates,
      bars,
      regimes: inferRegime(dates, bars),
    },
  };
}
