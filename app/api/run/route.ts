import { runPipeline } from "@/lib/agents/pipeline";
import { getActiveUniverse } from "@/lib/data/active";
import { SEED_LIBRARY } from "@/lib/alphas/library";
import { upsertSession } from "@/lib/store/session";
import type { SeedAlpha } from "@/lib/types";

export const runtime = "nodejs";

const SEED_IDS = new Set(SEED_LIBRARY.map((s) => s.id));

export async function POST(req: Request) {
  let extras: SeedAlpha[] = [];
  let llmUsed = false;
  try {
    const body = (await req.json()) as { alphas?: SeedAlpha[]; llmUsed?: boolean };
    extras = body.alphas ?? [];
    llmUsed = Boolean(body.llmUsed);
  } catch {
    extras = [];
  }
  const { universe, meta } = getActiveUniverse();
  const result = runPipeline(universe, extras, llmUsed, meta);
  const kept = result.evaluated.filter((a) => !SEED_IDS.has(a.id)).map((a) => ({
    id: a.id,
    name: a.name,
    category: a.category,
    expression: a.expression,
    source: a.source,
    rationale: a.rationale,
    parentId: a.parentId,
    generation: a.generation,
    mutation: a.mutation,
  }));
  upsertSession(
    { extras: kept, llmUsed, selectedId: result.book.selected[0]?.id ?? null },
    {
      at: new Date().toISOString(),
      kind: "factory",
      note: `factory ${result.evaluated.length} · Sharpe ${result.book.metrics.sharpe.toFixed(2)}`,
      extraIds: kept.map((s) => s.id),
      sharpe: result.book.metrics.sharpe,
    },
  );
  return Response.json(result);
}
