export type Category =
  | "momentum"
  | "meanrev"
  | "volatility"
  | "liquidity"
  | "technical"
  | "quality";

export type Regime = "bull" | "bear" | "sideways";

export type AlphaSource = "paper" | "wq" | "llm";

export type Bar = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap: number;
};

export type Ticker = {
  id: string;
  name: string;
  sector: string;
  beta: number;
};

export type Universe = {
  tickers: Ticker[];
  dates: string[];
  /** bars[ticker][t] */
  bars: Record<string, Bar[]>;
  regimes: Regime[];
};

export type AstNode =
  | { type: "num"; value: number }
  | { type: "field"; name: string }
  | { type: "call"; name: string; args: AstNode[] }
  | { type: "bin"; op: BinOp; left: AstNode; right: AstNode }
  | { type: "un"; op: "-"; arg: AstNode };

export type BinOp = "+" | "-" | "*" | "/" | "^" | ">" | "<" | ">=" | "<=" | "==";

export type SeedAlpha = {
  id: string;
  name: string;
  category: Category;
  expression: string;
  source: AlphaSource;
  rationale: string;
  parentId?: string;
  generation?: number;
  mutation?: string;
};

export type AlphaMetrics = {
  ic: number;
  icStd: number;
  tstat: number;
  ir: number;
  sharpe: number;
  sortino: number;
  calmar: number;
  totalReturn: number;
  annVol: number;
  maxDrawdown: number;
  hitRate: number;
  coverage: number;
  turnover: number;
};

export type AgentScores = {
  confidence: number;
  risk: number;
  final: number;
  passed: boolean;
  criticNote: string;
};

export type EvaluatedAlpha = SeedAlpha & {
  metrics: AlphaMetrics;
  scores: AgentScores;
  equity: number[];
  dailyReturns: number[];
  deciles: number[];
};

export type RegimeWeights = Record<Regime, number[]>;

export type Book = {
  selected: EvaluatedAlpha[];
  weights: RegimeWeights;
  equity: number[];
  bench: number[];
  dailyReturns: number[];
  benchReturns: number[];
  metrics: AlphaMetrics;
  benchMetrics: AlphaMetrics;
  regimePath: Regime[];
  pmNote: string;
};

export type AgentEvent = {
  agent: "proposer" | "critic" | "backtester" | "pm";
  t: string;
  body: string;
  tone?: "pass" | "fail" | "info";
};

export type PipelineResult = {
  proposed: SeedAlpha[];
  evaluated: EvaluatedAlpha[];
  book: Book;
  events: AgentEvent[];
  llmUsed: boolean;
};

export type Stage = "propose" | "filter" | "backtest" | "book";
