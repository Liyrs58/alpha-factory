# Methodology

## Loop

1. **Propose** — Seed DSL formulas (`lib/alphas/library.ts`) plus optional mock/NIM proposer.
2. **Score (critic)** — CSA/RPA with paper weights \(w_c=0.6\), \(w_r=0.4\), threshold \(\tau=0.58\) (`lib/agents/score.ts`).
3. **Training-only selection** — Single-alpha forward returns, IC, scores, signs, and deciles use only the first 60% of dates. An alpha's score never sees the reported test returns.
4. **Book (portfolio)** — The 60–80% interval is a chronological weight-history period. The final 20% is the reported test. Regime ridge/IC weights refit every 21 dates from a prefix ending on the current decision date; the top-k book earns close-to-close \(t\to t+1\) returns. Costs are 10 bps one-way on half-L1 turnover and are deducted daily.

## Splits

- **Default book:** chronological 60/20/20 TRAIN / weight-history / TEST boundaries are enforced in `lib/agents/pipeline.ts`; only final-20% book statistics are shown. Model constants are fixed in code, with no test-period tuning.

## What is not claimed

- Not the paper’s SSE50 universe or 3-layer MLP PM.
- DEMO10 book metrics are **SYNTHETIC** (planted structure).
- The final test is prequential: past test returns may enter later 21-day refits after those returns have occurred. These results are exploratory and the test should be frozen before model iteration.
- OOS benchmark is a daily equal-weight rebalance with no benchmark costs. It is a comparator, not an investable implementation.
- DEMO10 regime boundaries and planted return structure are synthetic and disclosed in `lib/data/universe.ts`.
