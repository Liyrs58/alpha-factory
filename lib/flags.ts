/**
 * Runtime flags. LIVE_TRADING stays false until a broker is actually wired.
 * LLM: NVIDIA NIM google/gemma-4-31b-it when NVIDIA_API_KEY is set, else mock.
 */

import { nvidiaKey, nvidiaModel } from "./llm/nvidia";

export function llmProvider(): "nvidia" | "mock" {
  return nvidiaKey() ? "nvidia" : "mock";
}

export function isLiveLlm(): boolean {
  return llmProvider() === "nvidia";
}

/** Env may be set; the app never sends live orders. */
export const LIVE_TRADING = false;

export type PaperOrder = {
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  type: "market";
};

export type PaperFill = { ok: false; reason: string };

export type PaperBroker = {
  name: string;
  enabled: boolean;
  submit(order: PaperOrder): Promise<PaperFill>;
};

/**
 * PAPER_BROKER — stub for a later Alpaca paper adapter.
 *
 * When wiring Alpaca:
 *   1. Keep LIVE_TRADING=false (and this flag) until paper URL + keys are verified.
 *   2. Implement submit() against https://paper-api.alpaca.markets (never live).
 *   3. Gate the UI on an explicit operator confirm; do not default enabled.
 *
 *   Example sketch (do not uncomment until keys exist):
 *   // const res = await fetch("https://paper-api.alpaca.markets/v2/orders", {
 *   //   method: "POST",
 *   //   headers: {
 *   //     "APCA-API-KEY-ID": process.env.ALPACA_KEY_ID ?? "",
 *   //     "APCA-API-SECRET-KEY": process.env.ALPACA_SECRET ?? "",
 *   //     "Content-Type": "application/json",
 *   //   },
 *   //   body: JSON.stringify({ symbol, qty, side, type: "market", time_in_force: "day" }),
 *   // });
 */
export const PAPER_BROKER: PaperBroker = {
  name: "paper",
  enabled: false,
  async submit(_order: PaperOrder): Promise<PaperFill> {
    return { ok: false, reason: "LIVE_TRADING=false · Alpaca paper broker not wired" };
  },
};

export function publicFlags() {
  return {
    liveTrading: LIVE_TRADING,
    llm: isLiveLlm() ? ("nvidia" as const) : ("mock" as const),
    provider: llmProvider(),
    model: isLiveLlm() ? nvidiaModel() : "mock",
  };
}
