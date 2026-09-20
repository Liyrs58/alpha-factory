import type { SeedAlpha } from "../types";

export const SESSION_LS_KEY = "alpha-factory-session-v1";

export type StoredRun = {
  at: string;
  kind: "factory" | "refine" | "propose" | "eval" | "universe";
  note: string;
  extraIds: string[];
  selectedId?: string;
  sharpe?: number;
};

export type LabSession = {
  version: 1;
  savedAt: string;
  extras: SeedAlpha[];
  selectedId: string | null;
  expression: string;
  llmUsed: boolean;
  runs: StoredRun[];
};
