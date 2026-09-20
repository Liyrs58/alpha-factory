import { UNIVERSE } from "@/lib/data/universe";
import { runPipeline } from "@/lib/agents/pipeline";
import type { SeedAlpha } from "@/lib/types";

export const runtime = "nodejs";

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
  const result = runPipeline(UNIVERSE, extras, llmUsed);
  return Response.json(result);
}
