import type { SeedAlpha } from "../types";

/**
 * Deterministic mock-LLM proposals (no API key). Distinct from the paper seed library
 * so LLM / REFINE visibly add rows rather than recycling A01–A24.
 */
export const MOCK_PROPOSALS: SeedAlpha[] = [
  {
    id: "M01",
    name: "VWAP impulse vs ATR",
    category: "momentum",
    expression: "rank(ts_delta(vwap, 3)) - rank(atr)",
    source: "llm",
    rationale: "Mock LLM: 3-day VWAP impulse against range; WorldQuant skeleton.",
  },
  {
    id: "M02",
    name: "Vol-scaled 10d reversion",
    category: "meanrev",
    expression: "(sma(close, 10) - close) / ts_std(close, 20)",
    source: "llm",
    rationale: "Mock LLM: distance-to-mean scaled by realized vol.",
  },
  {
    id: "M03",
    name: "Low-range quality",
    category: "quality",
    expression: "-rank((high - low) / close) + rank(ts_mean(volume, 5))",
    source: "llm",
    rationale: "Mock LLM: prefer tight ranges with rising participation.",
  },
  {
    id: "M04",
    name: "Gap vs delay volume",
    category: "liquidity",
    expression: "rank(open / delay(close, 1) - 1) - rank(volume)",
    source: "llm",
    rationale: "Mock LLM: overnight gap residual vs raw volume rank.",
  },
  {
    id: "M05",
    name: "MACD acceleration",
    category: "technical",
    expression: "rank(ts_delta(macd, 3)) - rank(ts_std(returns, 15))",
    source: "llm",
    rationale: "Mock LLM: MACD change with a vol penalty.",
  },
  {
    id: "M06",
    name: "Bollinger squeeze residual",
    category: "volatility",
    expression: "rank(close - boll_down) - rank(boll_up - boll_down)",
    source: "llm",
    rationale: "Mock LLM: location in the band minus band width.",
  },
  {
    id: "M07",
    name: "Typical-price mean-reversion",
    category: "meanrev",
    expression: "zscore(sma(typical, 20) - typical)",
    source: "llm",
    rationale: "Mock LLM: neutralized HLC typical vs its SMA.",
  },
  {
    id: "M08",
    name: "RSI vs volume rank",
    category: "momentum",
    expression: "rank(rsi - 50) - rank(ts_mean(volume, 10))",
    source: "llm",
    rationale: "Mock LLM: centered RSI minus slow volume.",
  },
];

export function mockPropose(offset = 0, n = 4): SeedAlpha[] {
  const out: SeedAlpha[] = [];
  for (let i = 0; i < n; i++) {
    const src = MOCK_PROPOSALS[(offset + i) % MOCK_PROPOSALS.length]!;
    out.push({
      ...src,
      id: `M${String(((offset + i) % MOCK_PROPOSALS.length) + 1).padStart(2, "0")}`,
    });
  }
  return out;
}
