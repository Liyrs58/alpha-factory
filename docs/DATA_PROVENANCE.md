# Data provenance

| Source | Kind | Path / how | Label |
| --- | --- | --- | --- |
| **DEMO10** | **SYNTHETIC forever** | `lib/data/universe.ts` seed `240906289`; planted IC structure documented in-file | **SYNTHETIC DEMO** |
| **Historical OHLCV** | External data only if uploaded by the user | No downloader or committed cache in this branch | Not demonstrated |
| **Upload CSV** | User-provided | Settings → UPLOAD; `data/universe-override.json` | **UPLOAD** |

## Cache schema

Long CSV: `date,ticker,open,high,low,close,volume` (optional `vwap`). Parsed by `lib/data/csv.ts` (≥2 tickers, ≥60 days).

## Offline

- DEMO10 always works with zero network.
- The current branch does not contain a historical downloader or historical experiment runner. `npm run experiment:historical` is not provided.

## DEMO10 planted structure (synthetic)

Next-day residual return depends on 14d momentum (bull), distance-from-SMA (sideways MR), inverse volume rank (liquidity). See `lib/data/universe.ts` plant loop. **Never** treat DEMO10 Sharpe/IC as live-market evidence.
