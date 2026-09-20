# Validation

## Automated

| Check | Command | Scope |
| --- | --- | --- |
| Unit (finance-critical) | `npm test` | No lookahead fit, walk-forward warm-up, fwd alignment, costs, DEMO10 synthetic flag |
| Self-test | `npm run selftest` | Parse, pipeline, refine, mock LLM, paper URL reject, CSV, session |
| Lint | `npm run lint` | ESLint |
| Build | `npm run build` | Next.js production build |
| CI | `.github/workflows/ci.yml` | `npm ci` → lint → test → selftest → build (no paid keys) |

## Leakage tests

`tests/portfolio-oos.test.ts`:

1. Scramble prices at \(t \ge t_1\); `fitRegimeWeightsOnRange(..., t1)` weights must be unchanged (**fails if future is read**).
2. Walk-forward eval days \(\ge\) `minTrainDays`.
3. On DEMO10, in-sample leaky Sharpe − walk-forward OOS Sharpe \(> 0.05\) (documents the old bug class).

## Experiment artifact

`experiments/stooq-liq10-wf-oos/{manifest,metrics}.json` written only by `scripts/run-historical-experiment.ts` after an executed run — never hand-edited Sharpe/IC.
