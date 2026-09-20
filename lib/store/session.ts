import type { SeedAlpha } from "../types";
import { readJson, writeJson } from "./backend";
import type { LabSession, StoredRun } from "./types";

export type { LabSession, StoredRun } from "./types";

const FILE = "lab-session.json";
const MAX_RUNS = 48;

export function emptySession(): LabSession {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    extras: [],
    selectedId: null,
    expression: "",
    llmUsed: false,
    runs: [],
  };
}

export async function loadSession(): Promise<LabSession> {
  const raw = await readJson<Partial<LabSession>>(FILE);
  if (!raw || raw.version !== 1) return emptySession();
  return {
    ...emptySession(),
    ...raw,
    version: 1,
    extras: Array.isArray(raw.extras) ? raw.extras : [],
    runs: Array.isArray(raw.runs) ? raw.runs.slice(-MAX_RUNS) : [],
  };
}

export async function saveSession(next: LabSession): Promise<LabSession> {
  const clipped: LabSession = {
    ...next,
    version: 1,
    savedAt: new Date().toISOString(),
    extras: next.extras.slice(-80),
    runs: next.runs.slice(-MAX_RUNS),
  };
  await writeJson(FILE, clipped);
  return clipped;
}

export function mergeExtras(base: SeedAlpha[], incoming: SeedAlpha[]): SeedAlpha[] {
  const map = new Map(base.map((s) => [s.id, s]));
  for (const s of incoming) map.set(s.id, s);
  return [...map.values()];
}

export async function upsertSession(
  patch: Partial<Omit<LabSession, "version">>,
  run?: StoredRun,
): Promise<LabSession> {
  const cur = await loadSession();
  const extras = patch.extras ? mergeExtras(cur.extras, patch.extras) : cur.extras;
  const runs = run ? [...cur.runs, run] : (patch.runs ?? cur.runs);
  return saveSession({
    ...cur,
    ...patch,
    extras,
    runs,
    selectedId: patch.selectedId !== undefined ? patch.selectedId : cur.selectedId,
    expression: patch.expression ?? cur.expression,
    llmUsed: patch.llmUsed ?? cur.llmUsed,
  });
}
