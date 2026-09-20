import type { Universe, UniverseMeta } from "../types";
import { readJson, removeJson, writeJson } from "../store/backend";
import { UNIVERSE } from "./universe";

export type { UniverseMeta };

const FILE = "universe-override.json";
const META_FILE = "universe-override-meta.json";

export function universeLabel(source: UniverseMeta["source"]): string {
  if (source === "DEMO10") return "SYNTHETIC DEMO";
  if (source === "historical") return "HISTORICAL OOS";
  return "UPLOAD";
}

export function metaOf(
  u: Universe,
  source: UniverseMeta["source"],
  extra?: Partial<UniverseMeta>,
): UniverseMeta {
  return {
    source,
    nS: u.tickers.length,
    nT: u.dates.length,
    dates: u.dates,
    tickers: u.tickers.map((t) => t.id),
    label: universeLabel(source),
    synthetic: source === "DEMO10",
    ...extra,
  };
}

export async function getActiveUniverse(): Promise<{ universe: Universe; meta: UniverseMeta }> {
  const override = await readJson<Universe>(FILE);
  if (override?.tickers?.length && override.dates?.length && override.bars) {
    const saved = await readJson<Partial<UniverseMeta>>(META_FILE);
    const source = saved?.source === "historical" ? "historical" : "upload";
    return {
      universe: override,
      meta: metaOf(override, source, {
        provider: saved?.provider,
        label: universeLabel(source),
        synthetic: false,
      }),
    };
  }
  return {
    universe: UNIVERSE,
    meta: metaOf(UNIVERSE, "DEMO10", {
      label: "SYNTHETIC DEMO",
      synthetic: true,
      provider: "seeded-rng",
    }),
  };
}

export async function setUploadedUniverse(
  u: Universe,
  source: "upload" | "historical" = "upload",
  provider?: string,
): Promise<void> {
  await writeJson(FILE, u);
  await writeJson(META_FILE, { source, provider, synthetic: false, label: universeLabel(source) });
}

export async function resetUploadedUniverse(): Promise<void> {
  await removeJson(FILE);
  await removeJson(META_FILE);
}
