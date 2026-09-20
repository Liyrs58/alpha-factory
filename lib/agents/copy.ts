import type { EvaluatedAlpha } from "../types";
import { fmtNum, fmtPct } from "../format";

export type AgentCard = {
  agent: "proposer" | "critic" | "backtester" | "pm";
  title: string;
  latency: string;
  body: string;
};

export function cardsForAlpha(a: EvaluatedAlpha, bookKept: boolean): AgentCard[] {
  const m = a.metrics;
  const to = `${Math.round(m.turnover * 100)}%`;
  const lineage = a.mutation
    ? `Refine ${a.parentId ?? "parent"} → ${a.id} (${a.mutation}). `
    : `Proposed ${a.expression}. `;
  return [
    {
      agent: "proposer",
      title: "PROPOSER",
      latency: "60ms",
      body: `${lineage}${a.rationale} IC decay profile suggests a 3–7 day horizon.`,
    },
    {
      agent: "critic",
      title: "CRITIC",
      latency: "120ms",
      body: a.mutation
        ? `${a.mutation}. θ=${fmtNum(a.scores.confidence, 2)} ρ=${fmtNum(a.scores.risk, 2)} |IC|=${fmtNum(Math.abs(m.ic), 3)}. ${a.scores.passed ? "Clears τ after rewrite." : "Still below τ; keep iterating."}`
        : bookKept
          ? `θ=${fmtNum(a.scores.confidence, 2)} ρ=${fmtNum(a.scores.risk, 2)}. Turnover may spike on volume shocks. Consider vol filter or ADV cap to improve robustness.`
          : `Below gate τ. θ=${fmtNum(a.scores.confidence, 2)} ρ=${fmtNum(a.scores.risk, 2)} |IC|=${fmtNum(Math.abs(m.ic), 3)}. Category slot filled by a higher-scoring seed.`,
    },
    {
      agent: "backtester",
      title: "BACKTESTER",
      latency: "1.82s",
      body: `Sharpe ${fmtNum(m.sharpe, 2)} | MaxDD ${fmtPct(m.maxDrawdown, 1)} | Turnover ${to} | IR t+1 ${fmtNum(m.ir, 2)}. Hit ${fmtPct(m.hitRate, 0)}. t-stat ${fmtNum(m.tstat, 2)}.`,
    },
    {
      agent: "pm",
      title: "PM",
      latency: "80ms",
      body: bookKept
        ? `Accept with guardrails. Cap turnover <45%, exclude bottom ADV decile. Position limit 75bps. Monitor crowding vs. peers.`
        : `Do not fund. Keep as research residual. If IC persists out of sample, revisit with tighter risk budget.`,
    },
  ];
}
