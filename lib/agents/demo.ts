import { UNIVERSE } from "../data/universe";
import type { PipelineResult, SeedAlpha } from "../types";
import { runPipeline } from "./pipeline";

let cached: PipelineResult | null = null;

export function demoPipeline(
  extras: SeedAlpha[] = [],
  llmUsed = false,
): PipelineResult {
  if (extras.length === 0 && !llmUsed) {
    cached ??= runPipeline(UNIVERSE);
    return cached;
  }
  return runPipeline(UNIVERSE, extras, llmUsed);
}
