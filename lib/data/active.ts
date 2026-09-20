import type { Universe, UniverseMeta } from "../types";
import { readJson, removeJson, writeJson } from "../store/backend";
import { UNIVERSE } from "./universe";

export type { UniverseMeta };

const FILE = "universe-override.json";

export function metaOf(u: Universe, source: UniverseMeta["source"]): UniverseMeta {
  return {
    source,
    nS: u.tickers.length,
    nT: u.dates.length,
    dates: u.dates,
    tickers: u.tickers.map((t) => t.id),
  };
}

export async function getActiveUniverse(): Promise<{ universe: Universe; meta: UniverseMeta }> {
  const override = await readJson<Universe>(FILE);
  if (override?.tickers?.length && override.dates?.length && override.bars) {
    return { universe: override, meta: metaOf(override, "upload") };
  }
  return { universe: UNIVERSE, meta: metaOf(UNIVERSE, "DEMO10") };
}

export async function setUploadedUniverse(u: Universe): Promise<void> {
  await writeJson(FILE, u);
}

export async function resetUploadedUniverse(): Promise<void> {
  await removeJson(FILE);
}
