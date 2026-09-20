import type { Universe, UniverseMeta } from "../types";
import { readJsonFile, removeJsonFile, writeJsonFile } from "../store/fsjson";
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

export function getActiveUniverse(): { universe: Universe; meta: UniverseMeta } {
  const override = readJsonFile<Universe>(FILE);
  if (override?.tickers?.length && override.dates?.length && override.bars) {
    return { universe: override, meta: metaOf(override, "upload") };
  }
  return { universe: UNIVERSE, meta: metaOf(UNIVERSE, "DEMO10") };
}

export function setUploadedUniverse(u: Universe) {
  writeJsonFile(FILE, u);
}

export function resetUploadedUniverse() {
  removeJsonFile(FILE);
}
