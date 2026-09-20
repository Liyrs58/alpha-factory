# Limitations

1. **Single-alpha UI table** still shows full-sample diagnostics (not walk-forward per alpha).
2. **Alpha selection** in the interactive factory still ranks on full-sample CSA/RPA; the historical **experiment** selects on TRAIN only. Residual selection bias in the lab UI.
3. **Regime labels** on uploads/historical are heuristic 60d market drift (`csv.ts`), not a published classifier; DEMO10 regimes are calendar synthetic.
4. **Costs/slippage** are stylized bps × turnover — not exchange microstructure.
5. **Universe** is tiny (10 names); capacity, borrow, and corporate actions ignored.
6. **Multiple testing**: many seeds screened; no FDR/Holm control — TEST metrics are exploratory.
7. **Ridge+IC PM** is a stand-in for the paper’s MLP.
8. **Yahoo/Stooq** availability varies by network; CI must stay offline via cache + DEMO10.
9. **Paper trading** is optional and never implies LIVE_TRADING (hard-false).
10. **No claim** of investable edge from DEMO10 or the shipped historical experiment alone.
