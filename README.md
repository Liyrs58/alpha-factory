# Alpha Factory

A **quant alpha discovery lab** — a charcoal+paper research IDE that runs the paper’s **proposer → critic → backtester → PM** loop on a shipped OHLCV sample.

Best use case: sit in the notebook, emit formulaic alphas (DSL), gate them (CSA/RPA), backtest long-short books, and iterate with **REFINE**. Works **offline with zero API keys** (deterministic mock LLM). Point `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` at a live proposer/critic when you want real model output.

Inspired by Kou et al., *Automate Strategy Finding with LLM in Quant Investment*, Findings of EMNLP 2025 ([arXiv:2409.06289](https://arxiv.org/abs/2409.06289) · [ACL](https://aclanthology.org/2025.findings-emnlp.1005/)) and [kouzhizhuo/Automate-Strategy-Finding-with-LLM-in-Quant-investment](https://github.com/kouzhizhuo/Automate-Strategy-Finding-with-LLM-in-Quant-investment).

This is an **executable slice** of that protocol, not a byte-for-byte SSE50 / 3-layer MLP reproduction. See [Real vs stub](#real-vs-stub).

## Run

Node 20+. **No keys required.**

```bash
git clone https://github.com/Liyrs58/alpha-factory.git
cd alpha-factory
npm ci
npm run dev
```

Opens [http://127.0.0.1:4731](http://127.0.0.1:4731). `npm ci` uses the committed lockfile (468 entries, including Next.js SWC binaries). If you prefer `npm install`, that is equivalent here.

```bash
npm run build
npx next start --port 4731
npm run selftest   # parse, backtest, refine mutation, mock propose
```

Sample prices are seeded (`240906289`) so factory metrics are deterministic. There are **no GitHub Actions** that rewrite `package-lock.json`.

## Optional LLM

Copy `env.example` (or `.env.example`) to `.env.local`:

```
OPENAI_API_KEY=
# OPENAI_MODEL=gpt-4o-mini
# ANTHROPIC_API_KEY=
# ANTHROPIC_MODEL=claude-sonnet-4-5-20250929
```

| Keys | Proposer (LLM button) | Critic (REFINE) |
| --- | --- | --- |
| none | mock formulas `M01`–`M08` | deterministic AST rewrite (window, zscore, volume residual, sign, vol-scale) |
| `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` | live chat completion, parse-checked DSL | live rewrite, mock fallback if the model output does not parse |

Empty keys keep the mock. Do not commit `.env.local`.

## Deploy on Vercel

Import [Liyrs58/alpha-factory](https://github.com/Liyrs58/alpha-factory). Framework preset: **Next.js**.

| Setting | Value |
| --- | --- |
| Install | `npm ci` (default with a lockfile) |
| Build | `npm run build` |
| Node | 20 |
| Env vars | **none required** |

Optional Production/Preview env: `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` (plus `OPENAI_MODEL` / `ANTHROPIC_MODEL` to override). Leave them unset for the same offline mock as local.

CLI:

```bash
npx vercel
```

First deploy succeeds with zero environment variables. Local port `4731` is only for `npm run dev` / `next start`; Vercel assigns its own URL. `/api/propose`, `/api/refine`, and `/api/run` are Node.js Route Handlers.

## Loop

1. **Proposer** — Seed Alpha Factory (paper + WorldQuant-style DSL) plus LLM or mock. Expressions are parsed and executed on OHLCV, not table decoration.
2. **Critic** — CSA + RPA, \(w_c=0.6\), \(w_r=0.4\), \(\tau=0.58\). **REFINE** rewrites the selected formula; new id `{parent}R{n}`; editor and agent notes show the mutation.
3. **Backtester** — Next-day long-short / top-k on DEMO10. Equity, Sharpe, max drawdown, IC/IR from returns.
4. **PM** — Regime (bull / bear / sideways) ridge+IC weights (stand-in for the paper’s 3-layer MLP). **BOOK** is the composite equity.

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

## Click-through

Status line under the header should change after every action.

- **▸ ALPHA FACTORY** / **F5 RUN** — seed factory; book Sharpe in the status line.
- **LLM** (no key) — `M01`–`M04` rows with their own Sharpe; status `mock LLM`.
- **REFINE (R)** — new id `A19R1`, new expression, new Sharpe; again → `A19R2`.
- Row click (`data-alpha-id`) — editor, agents, deciles, equity follow that alpha.
- **1Y / 3Y / 5Y / 10Y / ALL** — in the equity **header** (above the SVG). 10Y: *clamped to sample*.
- Type `sma(close,20)-close` → **FORMAT** → `sma(close, 20) - close`. Play → `ALP-SCR`.

Keys: `F5` factory · `r` refine · `F9` save · `j/k` rows · `⌃↵` eval.

## Disclaimer

Research demo. Not investment advice. Paper SSE50 figures are the authors’ experiments, not this app.
