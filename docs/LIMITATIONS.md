# Limitations

1. Single-alpha metrics and interactive scratch scores use the first 60% training period; there is no separate rolling single-alpha scorecard.
2. Alpha screening tests many seeds without FDR/Holm correction. The final test is exploratory and should be frozen before model iteration.
3. Regime labels on uploads/historical are heuristic 60-day market drift (`csv.ts`); DEMO10 regimes are synthetic calendar segments.
4. Costs are stylized 10 bps one-way on half-L1 daily turnover; spreads, slippage, impact, and borrow costs are not modeled.
5. The universe is small; capacity, borrow, and corporate actions are ignored.
6. The default 60/20/20 split uses the middle 20% as expanding weight history; the final 20% is evaluated prequentially as prior realized returns enter later refits.
7. The OOS equal-weight benchmark is rebalanced daily and has no transaction costs.
8. Ridge+IC PM is a stand-in for the paper's MLP.
9. DEMO10 contains planted return structure; its results cannot establish real-market alpha. Historical data availability varies by provider/network.
10. Paper trading is optional and never implies LIVE_TRADING (hard-false). No claim of investable edge is supported.
