# Validation

## Automated

| Check | Command | Scope |
| --- | --- | --- |
| Unit (finance-critical) | `npm test` | Past-only fit, future-perturbation invariance, forward alignment, costs, DEMO10 provenance |
| Self-test | `npm run selftest` | Parse, pipeline, refine, mock LLM, paper URL reject, CSV, session |
| Lint | `npm run lint` | ESLint |
| Build | `npm run build` | Next.js production build |
| CI | `.github/workflows/ci.yml` | `npm ci` → lint → test → selftest → build (no paid keys) |

## Chronological protocol

Alpha selection and sign come from the first 60% of dates. Regime weights refit from prefix data every 21 dates. Only the final 20% is scored; the middle 20% supplies past returns to the expanding weight fit. Tests perturb later prices and require earlier holdings to stay identical, and recompute close-to-close returns and costs from the recorded holdings.

## Historical experiment status

`experiments/stooq-liq10-wf-oos/manifest.json` refers to a cache path from another workspace that is not included in this repository. There is no historical experiment runner or reproducible metrics artifact in this branch. The manifest has been changed to `NOT_REPRODUCIBLE`; do not present it as a historical result.
