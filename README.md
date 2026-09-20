# Alpha Factory — LLM Strategy Discovery

Quant research notebook for **formulaic alphas**: propose expressions, run a multi-agent filter, backtest, then size a regime-adaptive book. Demo on a 10-name synthetic OHLCV panel (2019–2024). Focused lab slice, not a full paper reproduction.

Inspired by:

- Kou et al., *Automate Strategy Finding with LLM in Quant Investment*, Findings of EMNLP 2025. [arXiv:2409.06289](https://arxiv.org/abs/2409.06289) · [ACL Anthology](https://aclanthology.org/2025.findings-emnlp.1005/)
- Protocol code: [kouzhizhuo/Automate-Strategy-Finding-with-LLM-in-Quant-investment](https://github.com/kouzhizhuo/Automate-Strategy-Finding-with-LLM-in-Quant-investment)

## Run

```bash
npm i
npm run dev
```

Opens [http://127.0.0.1:4731](http://127.0.0.1:4731). **No API keys required.** Sample prices are seeded (`240906289`) so every run is deterministic.

Optional LLM: copy `env.example` to `.env.local` and set `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`. Without keys, **LLM** still proposes from the built-in LLM/WQ-style library.

## QA checklist (click-through)

Status line under the header should change after every action.

### Factory
- [ ] **▸ ALPHA FACTORY** or **F5 RUN** recomputes the seed factory; table fills; book Sharpe appears in the status line.
- [ ] **Stop** (square in the editor toolbar) while a run is in progress cancels it (`stopped`). If idle, status is `nothing running`.
- [ ] **F9 SAVE** (header or floppy icon) downloads `alpha-factory-session.json`.
- [ ] **LLM** without a key loads the next demo formula, evaluates it, and writes `demo propose Axx` in the status line.

### Expression
- [ ] Type `sma(close,20)-close` then **FORMAT** → `sma(close, 20) - close`.
- [ ] **Play** (or ⌃↵) evaluates the editor against DEMO10; a `SCR` row appears; Sharpe/IC in the status line.
- [ ] **UNDO** restores the previous expression; **CLEAR** empties the editor (`EMPTY`).
- [ ] **NEUTRALIZED** toggles yes/no (next eval wraps `zscore`).
- [ ] **DELAY** cycles 1 → 5 → 14 and rewrites `delay` / `ts_delta` windows in the formula.
- [ ] Gear icon opens/closes the settings strip.

### Agents
- [ ] **PROPOSER** card focuses the formula editor.
- [ ] **CRITIC** card cycles results filter ALL → PASSED → DROPPED.
- [ ] **BACKTESTER** card shows **ALPHA** equity.
- [ ] **PM** card switches to **BOOK** equity.
- [ ] **REFINE (R)** re-runs the factory (same as F5).

### Results + chart
- [ ] Click a table row: editor, agent notes, deciles, and equity follow that alpha.
- [ ] **ALL / PASSED / DROPPED** chips filter the table.
- [ ] Click a **decile bar**: footer shows `D# … bps/day`.
- [ ] **ALPHA** vs **BOOK** toggles the equity series.
- [ ] **1Y / 3Y / 5Y / 10Y / ALL** change the window label and bar count (sample is 2019–2024; 10Y shows *clamped to sample*).
- [ ] Hover the equity line for date + return.
- [ ] **EXPORT PNG** downloads `alpha-factory-equity.png`.

Keys: `F5` / `r` run · `F9` save · `j/k` rows · `⌃↵` eval.

## What it does

1. **Propose** — Seed Alpha Factory. Paper formulas plus LLM/WorldQuant-style skeletons (`rank(ts_delta(close, 5)) - rank(volume)`).
2. **Filter** — CSA + RPA, \(w_c=0.6\), \(w_r=0.4\), \(\tau=0.58\), category-balanced keep list.
3. **Backtest** — Next-day long-short / top-k. Equity, Sharpe, max drawdown, IC/IR.
4. **Book** — Regime (bull / bear / sideways) ridge+IC weights (stand-in for the paper’s 3-layer MLP).

## Stack

Next.js App Router, TypeScript, Tailwind. Parser, panel evaluator, and backtester run in the browser.

## Disclaimer

Research demo. Not investment advice. Paper SSE50 figures are the authors’ experiments, not this app.
