/**
 * Runtime flags. LIVE_TRADING is hard-false forever — the app never sends live orders.
 * LLM: NVIDIA NIM google/gemma-4-31b-it when NVIDIA_API_KEY is set, else mock.
 */

import { authRequired } from "./auth";
import {
  PAPER_API_DEFAULT,
  paperEnabled,
  paperMode,
  paperBrokerEnv,
  paperBaseUrl,
  submitPaperOrder,
  type PaperFill,
  type PaperOrder,
} from "./broker/alpaca";
import { nvidiaKey, nvidiaModel } from "./llm/nvidia";
import { isDurableStore, storeBackend } from "./store/backend";

export function llmProvider(): "nvidia" | "mock" {
  return nvidiaKey() ? "nvidia" : "mock";
}

export function isLiveLlm(): boolean {
  return llmProvider() === "nvidia";
}

/** Env may be set; the app never sends live orders. */
export const LIVE_TRADING = false;

export type { PaperOrder, PaperFill };

export type PaperBroker = {
  name: string;
  enabled: boolean;
  submit(order: PaperOrder): Promise<PaperFill>;
};

/**
 * PAPER_BROKER=off|alpaca.
 * alpaca + ALPACA_API_KEY/SECRET → paper-api.alpaca.markets (never live).
 * alpaca without keys → offline simulator.
 * off (default) → disabled. LIVE_TRADING stays false.
 */
export const PAPER_BROKER: PaperBroker = {
  get name() {
    return paperMode();
  },
  get enabled() {
    return paperEnabled();
  },
  async submit(order: PaperOrder): Promise<PaperFill> {
    if (LIVE_TRADING) return { ok: false, reason: "LIVE_TRADING=false" };
    return submitPaperOrder(order);
  },
};

export function publicFlags() {
  const mode = paperMode();
  const base = paperBaseUrl();
  return {
    liveTrading: LIVE_TRADING,
    llm: isLiveLlm() ? ("nvidia" as const) : ("mock" as const),
    provider: llmProvider(),
    model: isLiveLlm() ? nvidiaModel() : "mock",
    store: {
      durable: isDurableStore(),
      backend: storeBackend(),
    },
    auth: {
      required: authRequired(),
    },
    paper: {
      broker: paperBrokerEnv() === "alpaca" ? ("alpaca" as const) : ("off" as const),
      mode,
      enabled: paperEnabled(),
      live: LIVE_TRADING,
      base: mode === "alpaca" && base.ok ? base.url : PAPER_API_DEFAULT,
      keys: mode === "alpaca",
    },
  };
}
