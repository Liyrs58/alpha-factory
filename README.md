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
BLOB_READ_WRITE_TOKEN=
DEMO_ACCESS_CODE=
AUTH_SECRET=
PAPER_BROKER=off
ALPACA_API_KEY=
ALPACA_API_SECRET=
```

Get a `nvapi-…` key at [build.nvidia.com/settings](https://build.nvidia.com/settings). The app **streams** `POST https://integrate.api.nvidia.com/v1/chat/completions` with **`google/gemma-4-31b-it` only** (`stream: true`, 180s timeout for ~2 min cold start). Empty key keeps the mock. Do not commit `.env.local`.

| Keys | Proposer (LLM button) | Critic (REFINE) | Header badge |
| --- | --- | --- | --- |
| none | mock formulas `M01`–`M08` | deterministic AST rewrite (window, zscore, volume residual, sign, vol-scale) | **MOCK** |
| `NVIDIA_API_KEY` | NIM `google/gemma-4-31b-it` SSE stream, parse-checked DSL | NIM rewrite stream, mock fallback if output does not parse | **NVIDIA** |

`LIVE_TRADING` is hard-false in code **forever**. The app never sends live brokerage orders.

Optional **Alpaca paper** (research book only): `PAPER_BROKER=alpaca` plus `ALPACA_API_KEY` / `ALPACA_API_SECRET`. Default base `https://paper-api.alpaca.markets`. Live hosts (`api.alpaca.markets`) are refused. Without keys, `PAPER_BROKER=alpaca` uses an offline simulator. Orders are **never** placed on REFINE — only from the explicit **Paper submit** control in Settings (optional symbol, else last-session top-4 research-book longs). DEMO10 synthetic ids are never sent to Alpaca.

## Persistence

REFINE / LLM extras survive reload:

- Browser `localStorage` key `alpha-factory-session-v1`
- Server JSON via `@vercel/blob` when `BLOB_READ_WRITE_TOKEN` is set (`store.durable=true`)
- Fallback ephemeral `data/lab-session.json` (writable `/tmp/alpha-factory-lab-session.json` on Vercel)

F9 SAVE writes both the JSON download and the store. Factory `/api/run` and `/api/refine` upsert the same extras list.

## Optional access code

Unset `DEMO_ACCESS_CODE` → public. When set, `proxy.ts` gates the lab behind `/login`. A successful POST `/api/auth` sets an HttpOnly cookie signed with `AUTH_SECRET` (falls back to a digest of the access code). `/api/flags` and `/api/health` stay public and report `auth.required`.

## Optional OHLCV upload

Default universe is seeded **DEMO10** (10 names, 2019–2024). Settings → **UPLOAD OHLCV** accepts CSV `date,ticker,open,high,low,close,volume[,vwap]` (≥2 tickers, ≥60 days). **RESET DEMO10** drops the override. Uploads persist as `data/universe-override.json` (or `/tmp`, or Blob when the token is set).

## Deploy on Vercel

Import [Liyrs58/alpha-factory](https://github.com/Liyrs58/alpha-factory). Framework preset: **Next.js**.

| Setting | Value |
| --- | --- |
| Install | `npm ci` (default with a lockfile) |
| Build | `npm run build` |
| Node | 20 |
| Env vars | **none required** |

Optional Production/Preview env (all free-tier; no paid APIs):

| Variable | Effect |
| --- | --- |
| `NVIDIA_API_KEY` | NIM proposer/critic (`google/gemma-4-31b-it`) |
| `BLOB_READ_WRITE_TOKEN` | Durable session/universe JSON on Vercel Blob |
| `DEMO_ACCESS_CODE` | Optional access-code gate |
| `AUTH_SECRET` | Signs the gate cookie (recommended when gated) |
| `PAPER_BROKER` | `off` (default) or `alpaca` |
| `ALPACA_API_KEY` / `ALPACA_API_SECRET` | Alpaca **paper** account + optional Paper submit |
| `ALPACA_BASE_URL` | Optional; default `https://paper-api.alpaca.markets`; live URLs refused |
| `LIVE_TRADING` | Ignored; hard-false in code |

Leave everything unset for the same offline mock as local. Server JSON on Vercel is ephemeral `/tmp` unless Blob is configured; the browser store still keeps refine history.

CLI:

```bash
npx vercel
```

First deploy succeeds with zero environment variables. Local port `4731` is only for `npm run dev` / `next start`; Vercel assigns its own URL. `/api/propose`, `/api/refine`, `/api/run`, `/api/eval`, `/api/session`, `/api/universe`, `/api/flags`, `/api/health`, `/api/auth`, and `/api/paper` are Node.js Route Handlers.

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
| LLM proposer | **Real** with `NVIDIA_API_KEY` (NIM `google/gemma-4-31b-it`, `stream: true`, 180s timeout); **mock** otherwise (`M01`–`M08`) |
| Session / refine history | **Real** JSON store + localStorage; optional Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set |
| Book combiner | **Stub vs paper**: ridge+IC by regime, not the 3-layer MLP |
| Universe | **Stub vs paper**: synthetic DEMO10 default, not SSE50; optional CSV replace |
| Live trading | **Hard-off**: `LIVE_TRADING=false` forever |
| Alpaca paper | **Real** when `PAPER_BROKER=alpaca` + keys (paper URL only, explicit Paper submit); **sim** if alpaca without keys; **off** by default |

## Click-through

Status line under the header should change after every action.

- **▸ ALPHA FACTORY** / **F5 RUN** — seed factory; book Sharpe in the status line.
- **LLM** (no key) — `M01`–`M04` rows with their own Sharpe; status `mock LLM`; badge **MOCK**. With `NVIDIA_API_KEY`, badge **NVIDIA**.
- **REFINE (R)** — new id `A19R1`, new expression, new Sharpe; again → `A19R2`. Reload keeps `A19R*` rows.
- Row click (`data-alpha-id`) — editor, agents, deciles, equity follow that alpha.
- **1Y / 3Y / 5Y / 10Y / ALL** — in the equity **header** (above the SVG). 10Y: *clamped to sample*.
- Type `sma(close,20)-close` → **FORMAT** → `sma(close, 20) - close`. Play → `ALP-SCR`.
- Settings → upload CSV / RESET DEMO10. Settings → **Paper submit** (only if `PAPER_BROKER=alpaca`) never fires on REFINE.
- `/api/flags` and `/api/health` expose `store.durable`, `auth.required`, and the LLM badge (`MOCK` / `NVIDIA`).

Keys: `F5` factory · `r` refine · `F9` save · `j/k` rows · `⌃↵` eval.

## Disclaimer

Research demo. Not investment advice. Paper SSE50 figures are the authors’ experiments, not this app.
