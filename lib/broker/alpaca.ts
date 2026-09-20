/**
 * Alpaca *paper* adapter (research book only). LIVE_TRADING stays false.
 * PAPER_BROKER=off|alpaca. Without keys, alpaca falls back to the offline simulator.
 * Live Alpaca hosts are refused.
 */

import { DEMO10_IDS } from "../data/universe";
import { readJson, writeJson } from "../store/backend";
import type { UniverseMeta } from "../types";

/** Hard-false in this module. Live Alpaca hosts are refused. */
const LIVE_TRADING = false;

export const PAPER_API_DEFAULT = "https://paper-api.alpaca.markets";
const LEDGER = "paper-ledger.json";
const SIM_CASH = 100_000;

export type PaperMode = "off" | "alpaca" | "sim";
export type PaperSide = "buy" | "sell";

export type PaperOrder = {
  symbol: string;
  side: PaperSide;
  qty: number;
  type: "market";
};

export type PaperFill = {
  ok: boolean;
  reason?: string;
  id?: string;
  symbol?: string;
  side?: PaperSide;
  qty?: number;
  status?: string;
  source?: "alpaca" | "sim";
};

export type PaperAccount = {
  source: "alpaca" | "sim" | "off";
  status: string;
  cash: number;
  equity: number;
  buyingPower: number;
  currency: string;
  patternDayTrader?: boolean;
  tradingBlocked?: boolean;
};

export type PaperLedger = {
  version: 1;
  cash: number;
  equity: number;
  buyingPower: number;
  fills: Array<{
    at: string;
    id: string;
    symbol: string;
    side: PaperSide;
    qty: number;
    status: string;
    source: "alpaca" | "sim";
  }>;
};

export function paperBrokerEnv(): string {
  return (process.env.PAPER_BROKER ?? "off").trim().toLowerCase();
}

export function alpacaKey(): string | null {
  const k =
    process.env.ALPACA_API_KEY?.trim() ||
    process.env.APCA_API_KEY_ID?.trim() ||
    "";
  return k || null;
}

export function alpacaSecret(): string | null {
  const k =
    process.env.ALPACA_API_SECRET?.trim() ||
    process.env.ALPACA_API_SECRET_KEY?.trim() ||
    process.env.APCA_API_SECRET_KEY?.trim() ||
    "";
  return k || null;
}

export function alpacaKeysReady(): boolean {
  return Boolean(alpacaKey() && alpacaSecret());
}

/** Live hosts are never used. LIVE_TRADING remains false. */
export function isLiveAlpacaUrl(raw: string): boolean {
  let host = "";
  try {
    host = new URL(raw).hostname.toLowerCase();
  } catch {
    host = raw.replace(/^https?:\/\//i, "").split("/")[0]?.toLowerCase() ?? "";
  }
  if (!host) return true;
  if (host === "paper-api.alpaca.markets") return false;
  if (host === "api.alpaca.markets") return true;
  if (host.includes("live")) return true;
  if (host.endsWith("alpaca.markets") && !host.includes("paper")) return true;
  return false;
}

export function paperBaseUrl(): { ok: true; url: string } | { ok: false; reason: string } {
  const raw = (process.env.ALPACA_BASE_URL?.trim() || PAPER_API_DEFAULT).replace(/\/+$/, "");
  if (LIVE_TRADING) {
    return { ok: false, reason: "LIVE_TRADING=false · refuse live trading" };
  }
  if (isLiveAlpacaUrl(raw)) {
    return { ok: false, reason: `LIVE_TRADING=false · refuse live Alpaca URL (${raw})` };
  }
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.hostname !== "localhost" && u.hostname !== "127.0.0.1") {
      return { ok: false, reason: "paper Alpaca URL must be https" };
    }
    return { ok: true, url: `${u.protocol}//${u.host}` };
  } catch {
    return { ok: false, reason: "invalid ALPACA_BASE_URL" };
  }
}

/**
 * off → disabled.
 * alpaca + keys → real paper API.
 * alpaca without keys → offline simulator.
 */
export function paperMode(): PaperMode {
  if (paperBrokerEnv() !== "alpaca") return "off";
  return alpacaKeysReady() ? "alpaca" : "sim";
}

export function paperEnabled(): boolean {
  return paperMode() !== "off";
}

function emptyLedger(): PaperLedger {
  return {
    version: 1,
    cash: SIM_CASH,
    equity: SIM_CASH,
    buyingPower: SIM_CASH,
    fills: [],
  };
}

export async function loadLedger(): Promise<PaperLedger> {
  const raw = await readJson<Partial<PaperLedger>>(LEDGER);
  if (!raw || raw.version !== 1) return emptyLedger();
  return {
    ...emptyLedger(),
    ...raw,
    version: 1,
    fills: Array.isArray(raw.fills) ? raw.fills.slice(-80) : [],
  };
}

async function saveLedger(next: PaperLedger): Promise<PaperLedger> {
  const clipped: PaperLedger = { ...next, version: 1, fills: next.fills.slice(-80) };
  await writeJson(LEDGER, clipped);
  return clipped;
}

function alpacaHeaders(): HeadersInit {
  return {
    "APCA-API-KEY-ID": alpacaKey() ?? "",
    "APCA-API-SECRET-KEY": alpacaSecret() ?? "",
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function readPaperAccount(): Promise<
  { ok: true; account: PaperAccount } | { ok: false; reason: string; account: PaperAccount }
> {
  const mode = paperMode();
  const sim: PaperAccount = {
    source: mode === "off" ? "off" : "sim",
    status: mode === "off" ? "OFF" : "ACTIVE",
    cash: SIM_CASH,
    equity: SIM_CASH,
    buyingPower: SIM_CASH,
    currency: "USD",
  };
  if (mode === "off") {
    return { ok: false, reason: "PAPER_BROKER=off", account: sim };
  }
  const ledger = await loadLedger();
  sim.cash = ledger.cash;
  sim.equity = ledger.equity;
  sim.buyingPower = ledger.buyingPower;

  if (mode !== "alpaca") {
    return { ok: true, account: sim };
  }

  const base = paperBaseUrl();
  if (!base.ok) return { ok: false, reason: base.reason, account: sim };

  try {
    const res = await fetch(`${base.url}/v2/account`, {
      headers: alpacaHeaders(),
      cache: "no-store",
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return {
        ok: false,
        reason: `Alpaca account HTTP ${res.status}`,
        account: sim,
      };
    }
    return {
      ok: true,
      account: {
        source: "alpaca",
        status: String(body.status ?? "ACTIVE"),
        cash: num(body.cash, ledger.cash),
        equity: num(body.equity, ledger.equity),
        buyingPower: num(body.buying_power, ledger.buyingPower),
        currency: String(body.currency ?? "USD"),
        patternDayTrader: Boolean(body.pattern_day_trader),
        tradingBlocked: Boolean(body.trading_blocked),
      },
    };
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : "Alpaca account failed",
      account: sim,
    };
  }
}

export function normalizeSymbol(raw: string): string {
  return raw.trim().toUpperCase();
}

export function symbolAllowedOnAlpaca(symbol: string, universe: UniverseMeta["source"]): boolean {
  if (LIVE_TRADING) return false;
  if (!/^[A-Z][A-Z0-9.]{0,9}$/.test(symbol)) return false;
  if (universe === "DEMO10" && DEMO10_IDS.has(symbol)) return false;
  return true;
}

export async function submitPaperOrder(
  order: PaperOrder,
  universe: UniverseMeta["source"] = "DEMO10",
): Promise<PaperFill> {
  if (LIVE_TRADING) {
    return { ok: false, reason: "LIVE_TRADING=false" };
  }
  const mode = paperMode();
  if (mode === "off") {
    return { ok: false, reason: "PAPER_BROKER=off" };
  }
  const symbol = normalizeSymbol(order.symbol);
  const qty = Math.floor(Number(order.qty));
  const side = order.side === "sell" ? "sell" : "buy";
  if (!symbol || !Number.isFinite(qty) || qty <= 0) {
    return { ok: false, reason: "invalid paper order" };
  }

  const useAlpaca = mode === "alpaca" && symbolAllowedOnAlpaca(symbol, universe);
  if (mode === "alpaca" && !useAlpaca) {
    return {
      ok: false,
      reason: `refuse Alpaca paper for ${symbol} (DEMO10 synthetic / invalid). Upload real OHLCV or submit an explicit listed symbol.`,
    };
  }

  if (useAlpaca) {
    const base = paperBaseUrl();
    if (!base.ok) return { ok: false, reason: base.reason };
    try {
      const res = await fetch(`${base.url}/v2/orders`, {
        method: "POST",
        headers: alpacaHeaders(),
        body: JSON.stringify({
          symbol,
          qty: String(qty),
          side,
          type: "market",
          time_in_force: "day",
        }),
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        const msg = String(body.message ?? body.error ?? `HTTP ${res.status}`);
        return { ok: false, reason: `Alpaca paper ${msg}`.slice(0, 240) };
      }
      const fill: PaperFill = {
        ok: true,
        id: String(body.id ?? ""),
        symbol,
        side,
        qty,
        status: String(body.status ?? "accepted"),
        source: "alpaca",
      };
      const ledger = await loadLedger();
      ledger.fills.push({
        at: new Date().toISOString(),
        id: fill.id ?? `alpaca-${Date.now()}`,
        symbol,
        side,
        qty,
        status: fill.status ?? "accepted",
        source: "alpaca",
      });
      await saveLedger(ledger);
      return fill;
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : "Alpaca order failed" };
    }
  }

  const ledger = await loadLedger();
  const id = `sim-${Date.now()}-${symbol}`;
  ledger.fills.push({
    at: new Date().toISOString(),
    id,
    symbol,
    side,
    qty,
    status: "filled",
    source: "sim",
  });
  const notional = qty * 10;
  if (side === "buy") ledger.cash = Math.max(0, ledger.cash - notional);
  else ledger.cash += notional;
  ledger.equity = ledger.cash;
  ledger.buyingPower = ledger.cash;
  await saveLedger(ledger);
  return { ok: true, id, symbol, side, qty, status: "filled", source: "sim" };
}
