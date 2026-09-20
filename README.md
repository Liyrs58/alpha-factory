# Alpha Factory — LLM Strategy Discovery

Quant research notebook that runs the **proposer → critic → backtester → PM** loop from Kou et al.: emit formulaic alphas, score them (CSA/RPA), backtest on a shipped OHLCV panel, then size a regime-adaptive book.

Inspired by:

- Kou et al., *Automate Strategy Finding with LLM in Quant Investment*, Findings of EMNLP 2025. [arXiv:2409.06289](https://arxiv.org/abs/2409.06289) · [ACL Anthology](https://aclanthology.org/2025.findings-emnlp.1005/)
- Protocol code: [kouzhizhuo/Automate-Strategy-Finding-with-LLM-in-Quant-investment](https://github.com/kouzhizhuo/Automate-Strategy-Finding-with-LLM-in-Quant-investment)

This is a faithful **executable slice**, not a byte-for-byte SSE50/MLP reproduction. See **Real vs stub** below.

## Run

```bash
npm install
npm run dev
```

Opens [http://127.0.0.1:4731](http://127.0.0.1:4731). **No API keys required.** Sample prices are seeded (`240906289`) so every run is deterministic. The lockfile is a full `npm install` (468 lockfile entries / 368 installable packages, including Next.js SWC binaries). There is no GitHub Action that rewrites `package-lock.json`.

```bash
npm run build
npx next start --port 4731
```

Optional live LLM: copy `env.example` to `.env.local` and set `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`. Without keys, proposer and critic use the **deterministic mock**.

## Loop

1. **Proposer** — Seed Alpha Factory (paper + WorldQuant-style DSL) plus **LLM** (or mock) formulas. Expressions are parsed and executed, not table decoration.
2. **Critic** — CSA + RPA, \(w_c=0.6\), \(w_r=0.4\), \(\tau=0.58\). **REFINE** rewrites the selected formula (window, zscore, volume residual, sign, vol-scale) and re-scores it. The new row id is `{parent}R{n}` and the editor shows the new expression.
3. **Backtester** — Next-day long-short / top-k on DEMO10 OHLCV. Equity, Sharpe, max drawdown, IC/IR are computed from returns.
4. **PM** — Regime (bull / bear / sideways) ridge+IC weights (stand-in for the paper’s 3-layer MLP). **BOOK** shows the composite equity.

## Real vs stub

| Piece | Status |
| --- | --- |
| Formula DSL parse + eval on OHLCV | **Real** (browser + `/api/run`) |
| Cross-section rank / zscore, ts_* windows | **Real** |
| Backtest Sharpe / drawdown / equity / IC / IR / deciles | **Real** on seeded DEMO10 (10 names, 2019–2024) |
| CSA/RPA critic scores and τ gate | **Real** (paper weights; not their SSE50 numbers) |
| REFINE rewrite + re-backtest | **Real** (deterministic critic; LLM critic if a key is set) |
| LLM proposer | **Real** with `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`; **mock** otherwise (`M01`–`M08`) |
| Book combiner | **Stub vs paper**: ridge+IC by regime, not the 3-layer MLP |
| Universe | **Stub vs paper**: synthetic DEMO10, not SSE50 |

## QA checklist (click-through)

Status line under the header should change after every action. No dead buttons.

### Factory
- [ ] **▸ ALPHA FACTORY** or **F5 RUN** recomputes the seed factory; table fills; book Sharpe in the status line.
- [ ] **Stop** while a run is in progress → `stopped`. Idle → `nothing running`.
- [ ] **F9 SAVE** downloads `alpha-factory-session.json`.
- [ ] **LLM** without a key adds mock formulas `M01`–`M04` (status `mock LLM`) and they appear as `ALP-M0x` rows with their own Sharpe.

### Expression
- [ ] Type `sma(close,20)-close` then **FORMAT** → `sma(close, 20) - close`.
- [ ] **Play** evaluates against DEMO10; `ALP-SCR` row; Sharpe/IC in the status line.
- [ ] **UNDO** / **CLEAR**. **NEUTRALIZED** and **DELAY** change the next eval / rewrite windows.
- [ ] Gear opens the settings strip.

### Agents
- [ ] **PROPOSER** focuses the editor.
- [ ] **CRITIC** cycles ALL / PASSED / DROPPED.
- [ ] **BACKTESTER** → ALPHA equity. **PM** → BOOK equity.
- [ ] **REFINE (R)** mutates the selected formula: new id `A19R1` (etc.), editor text changes, new Sharpe, agent notes mention the rewrite. Click REFINE again for `A19R2`.

### Results + chart
- [ ] Click a table row (`data-alpha-id`): editor, agent notes, deciles, and equity follow that alpha.
- [ ] Decile bar → `D# … bps`.
- [ ] **1Y / 3Y / 5Y / 10Y / ALL** sit in the equity header (above the SVG). Status + `EQUITY CURVE •` label change. 10Y: *clamped to sample*.
- [ ] Hover equity for date + return. **EXPORT PNG**.

Keys: `F5` factory · `r` refine · `F9` save · `j/k` rows · `⌃↵` eval.

## Disclaimer

Research demo. Not investment advice. Paper SSE50 figures are the authors’ experiments, not this app.
