import { clamp, sigmoid } from "../rng";
import type { AlphaMetrics, AgentScores } from "../types";
import { WC, WR, TAU } from "../alphas/library";

/** Confidence Score Agent — statistical reliability of IC / IR / coverage. */
export function confidenceScore(m: AlphaMetrics): number {
  const icTerm = sigmoid(Math.abs(m.ic) * 55);
  const irTerm = sigmoid(Math.abs(m.ir) * 1.1);
  const cov = clamp(m.coverage, 0, 1);
  return clamp(0.5 * icTerm + 0.35 * irTerm + 0.15 * cov, 0, 1);
}

/**
 * Risk Preference Agent — prefers contained drawdowns, moderate turnover,
 * and non-catastrophic left tail. Higher is better (risk-aware quality).
 */
export function riskScore(m: AlphaMetrics): number {
  const dd = clamp(1 + m.maxDrawdown / 0.28, 0, 1);
  const to = clamp(1 - m.turnover / 1.2, 0, 1);
  const vol = clamp(1 - m.annVol / 0.55, 0, 1);
  const sort = sigmoid(m.sortino);
  return clamp(0.4 * dd + 0.2 * to + 0.2 * vol + 0.2 * sort, 0, 1);
}

export function scoreAlpha(m: AlphaMetrics, wc = WC, wr = WR, tau = TAU): AgentScores {
  const confidence = confidenceScore(m);
  const risk = riskScore(m);
  const final = wc * confidence + wr * risk;
  const passed = final > tau && Math.abs(m.ic) > 0.008 && m.coverage > 0.45;
  const invert = m.ic < 0 ? "  book will invert sign" : "";
  const criticNote = [
    `CSA  |IC|=${Math.abs(m.ic).toFixed(3)}  IR=${m.ir.toFixed(2)}  cov=${m.coverage.toFixed(2)}  → θ=${confidence.toFixed(2)}`,
    `RPA  mdd=${(m.maxDrawdown * 100).toFixed(1)}%  to=${m.turnover.toFixed(2)}  vol=${(m.annVol * 100).toFixed(1)}%  → ρ=${risk.toFixed(2)}`,
    `score ${final.toFixed(3)} = ${wc}·θ + ${wr}·ρ   ${passed ? "PASS" : "REJECT"} τ=${tau}${invert}`,
  ].join("\n");
  return { confidence, risk, final, passed, criticNote };
}
