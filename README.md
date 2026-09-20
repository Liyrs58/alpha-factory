# Alpha Factory

A **quant alpha discovery lab** — a charcoal+paper research IDE that runs the paper’s **proposer → critic → backtester → PM** loop on a shipped OHLCV sample.

Best use case: sit in the notebook, emit formulaic alphas (DSL), gate them (CSA/RPA), backtest long-short books, and iterate with **REFINE**. Works **offline with zero API keys** (deterministic mock LLM). Optional live proposer/critic uses **NVIDIA NIM** (`NVIDIA_API_KEY` → `google/gemma-4-31b-it` at `https://integrate.api.nvidia.com/v1`). No OpenAI or Anthropic keys.

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
npm run selftest   # parse, backtest, refine mutation, mock propose, store, CSV
```

Sample prices are seeded (`240906289`) so factory metrics are deterministic. There are **no GitHub Actions** that rewrite `package-lock.json`.

## Optional NVIDIA NIM

Copy `.env.example` (or `env.example`) to `.env.local`:

```
NVIDIA_API_KEY=
LIVE_TRADING=false
```

Get a `nvapi-…` key at [build.nvidia.com/settings](https://build.nvidia.com/settings). The app calls `https://integrate.api.nvidia.com/v1/chat/completions` with **`google/gemma-4-31b-it` only** (not overridable). Empty key keeps the mock. Do not commit `.env.local`.

| Keys | Proposer (LLM button) | Critic (REFINE) | Header badge |
| --- | --- | --- | --- |
| none | mock formulas `M01`–`M08` | deterministic AST rewrite (window, zscore, volume residual, sign, vol-scale) | **MOCK** |
| `NVIDIA_API_KEY` | NIM `google/gemma-4-31b-it`, parse-checked DSL | NIM rewrite, mock fallback if output does not parse | **NVIDIA** |

`LIVE_TRADING` is hard-false in code. A `PAPER_BROKER` interface is stubbed (commented Alpaca paper sketch) and never submits orders.

## Persistence

REFINE / LLM extras survive reload:

- Browser `localStorage` key `alpha-factory-session-v1`
- Server JSON `data/lab-session.json` (writable `/tmp/alpha-factory-lab-session.json` on Vercel)

F9 SAVE writes both the JSON download and the store. Factory `/api/run` and `/api/refine` upsert the same extras list.

## Optional OHLCV upload

Default universe is seeded **DEMO10** (10 names, 2019–2024). Settings → **UPLOAD OHLCV** accepts CSV `date,ticker,open,high,low,close,volume[,vwap]` (≥2 tickers, ≥60 days). **RESET DEMO10** drops the override. Uploads persist as `data/universe-override.json` (or `/tmp`).

## Deploy on Vercel

Import [Liyrs58/alpha-factory](https://github.com/Liyrs58/alpha-factory). Framework preset: **Next.js**.

| Setting | Value |
| --- | --- |
| Install | `npm ci` (default with a lockfile) |
| Build | `npm run build` |
| Node | 20 |
| Env vars | **none required** |

Optional Production/Preview env: `NVIDIA_API_KEY` only. Model is locked to `google/gemma-4-31b-it`. Leave unset for the same offline mock as local. Server JSON on Vercel lives in `/tmp` (ephemeral); the browser store is the durable refine history.

CLI:

```bash
npx vercel
```

First deploy succeeds with zero environment variables. Local port `4731` is only for `npm run dev` / `next start`; Vercel assigns its own URL. `/api/propose`, `/api/refine`, `/api/run`, `/api/eval`, `/api/session`, `/api/universe`, and `/api/flags` are Node.js Route Handlers.

## Loop

1. **Proposer** — Seed Alpha Factory (paper + WorldQuant-style DSL) plus NVIDIA NIM or mock. Expressions are parsed and executed on OHLCV, not table decoration.
2. **Critic** — CSA + RPA, \(w_c=0.6\), \(w_r=0.4\), \(\tau=0.58\). **REFINE** rewrites the selected formula; new id `{parent}R{n}`; editor and agent notes show the mutation.
3. **Backtester** — Next-day long-short / top-k on the active universe (DEMO10 or upload). Equity, Sharpe, max drawdown, IC/IR from returns.
4. **PM** — Regime (bull / bear / sideways) ridge+IC weights (stand-in for the paper’s 3-layer MLP). **BOOK** is the composite equity.

## Real vs stub

| Piece | Status |
| --- | --- |
| Formula DSL parse + eval on OHLCV | **Real** (browser + `/api/run`) |
| Cross-section rank / zscore, ts_* windows | **Real** |
| Backtest Sharpe / drawdown / equity / IC / IR / deciles | **Real** on seeded DEMO10 (or uploaded CSV) |
| CSA/RPA critic scores and τ gate | **Real** (paper weights; not their SSE50 numbers) |
| REFINE rewrite + re-backtest | **Real** (deterministic critic; NIM critic if `NVIDIA_API_KEY` is set) |
| LLM proposer | **Real** with `NVIDIA_API_KEY` (NIM `google/gemma-4-31b-it`); **mock** otherwise (`M01`–`M08`) |
| Session / refine history | **Real** JSON store + localStorage |
| Book combiner | **Stub vs paper**: ridge+IC by regime, not the 3-layer MLP |
| Universe | **Stub vs paper**: synthetic DEMO10 default, not SSE50; optional CSV replace |
| Live trading / Alpaca | **Stub**: `LIVE_TRADING=false`, `PAPER_BROKER` not wired |

## Click-through

Status line under the header should change after every action.

- **▸ ALPHA FACTORY** / **F5 RUN** — seed factory; book Sharpe in the status line.
- **LLM** (no key) — `M01`–`M04` rows with their own Sharpe; status `mock LLM`; badge **MOCK**. With `NVIDIA_API_KEY`, badge **NVIDIA**.
- **REFINE (R)** — new id `A19R1`, new expression, new Sharpe; again → `A19R2`. Reload keeps `A19R*` rows.
- Row click (`data-alpha-id`) — editor, agents, deciles, equity follow that alpha.
- **1Y / 3Y / 5Y / 10Y / ALL** — in the equity **header** (above the SVG). 10Y: *clamped to sample*.
- Type `sma(close,20)-close` → **FORMAT** → `sma(close, 20) - close`. Play → `ALP-SCR`.
- Settings → upload CSV / RESET DEMO10.

Keys: `F5` factory · `r` refine · `F9` save · `j/k` rows · `⌃↵` eval.

## Disclaimer

Research demo. Not investment advice. Paper SSE50 figures are the authors’ experiments, not this app.
