# Methodology

## Loop

1. **Propose** — Seed DSL formulas (`lib/alphas/library.ts`) plus optional mock/NIM proposer.
2. **Score (critic)** — CSA/RPA with paper weights \(w_c=0.6\), \(w_r=0.4\), threshold \(\tau=0.58\) (`lib/agents/score.ts`).
3. **Backtest (single alpha)** — Next-day long-short / top-k; IC is Spearman-style via rank Pearson (`lib/backtest/engine.ts`). Full-sample single-alpha metrics in the UI are **diagnostics**, not OOS claims.
4. **Book (portfolio)** — Expanding **walk-forward OOS**: at day \(t\), IC signs + regime ridge/IC weights are fit on \([0,t)\) only, then the top-k book earns the \(t\to t+1\) forward return (`lib/portfolio/combine.ts`). Costs: stylized bps × turnover.

## Splits

- **Walk-forward (default book):** warm-up `minTrainDays` (default 252), refit every 21 days.
- **Fixed TRAIN/VAL/TEST:** `fixedSplit` 60/20/20 for experiments (`experiments/*/manifest.json`).

## What is not claimed

- Not the paper’s SSE50 universe or 3-layer MLP PM.
- DEMO10 book metrics are **SYNTHETIC** (planted structure).
- Historical experiment metrics are **small-panel exploratory OOS**, not production alpha.
