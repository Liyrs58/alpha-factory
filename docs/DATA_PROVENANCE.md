# Data provenance

| Source | Kind | Path / how | Label |
| --- | --- | --- | --- |
| **DEMO10** | **SYNTHETIC forever** | `lib/data/universe.ts` seed `240906289`; planted IC structure documented in-file | **SYNTHETIC DEMO** |
| **Historical OHLCV** | Market (Yahoo chart v8; Stooq fallback) | `lib/data/download.ts` → cache `data/cache/ohlcv/*.csv` | **HISTORICAL OOS** |
| **Upload CSV** | User-provided | Settings → UPLOAD; `data/universe-override.json` | **UPLOAD** |

## Cache schema

Long CSV: `date,ticker,open,high,low,close,volume` (optional `vwap`). Parsed by `lib/data/csv.ts` (≥2 tickers, ≥60 days).

## Offline

- DEMO10 always works with zero network.
- Historical: `npm run experiment:historical` uses cache if present; `AF_EXPERIMENT_OFFLINE=1` refuses download.
- Instructions: `npx tsx -e` calling `downloadHistoricalUniverse()` or `npm run experiment:historical`.

## DEMO10 planted structure (synthetic)

Next-day residual return depends on 14d momentum (bull), distance-from-SMA (sideways MR), inverse volume rank (liquidity). See `lib/data/universe.ts` plant loop. **Never** treat DEMO10 Sharpe/IC as live-market evidence.
