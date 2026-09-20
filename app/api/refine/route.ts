import { criticRewrite, nextRefinedId } from "@/lib/agents/mutate";
import { runPipelineFromSeeds } from "@/lib/agents/pipeline";
import { parse } from "@/lib/alphas/parser";
import { getActiveUniverse } from "@/lib/data/active";
import { isLiveLlm } from "@/lib/flags";
import { extractJsonObject, nimChat } from "@/lib/llm/nvidia";
import { SEED_LIBRARY } from "@/lib/alphas/library";
import { upsertSession } from "@/lib/store/session";
import type { SeedAlpha } from "@/lib/types";

export const runtime = "nodejs";

const CRITIC_SYSTEM = `You rewrite one formulaic alpha. Return JSON only:
{"expression":string,"label":string,"note":string}
Rules: single executable formula. Fields: open, high, low, close, volume, vwap, returns, rsi, atr, boll_up, boll_down, macd, typical.
Functions: delay, ts_delta, ts_mean, sma, std, ts_std, ts_sum, ts_max, ts_min, ts_rank, rank, zscore, scale, abs, log, sign, sqrt, signedpower, correlation, ema.
Change the formula (window, neutralization, volume residual, or sign). No assignment.`;

type Body = {
  parent?: SeedAlpha;
  pool?: SeedAlpha[];
  generation?: number;
};

async function llmRewrite(parent: SeedAlpha): Promise<{ expression: string; label: string; note: string } | null> {
  if (!isLiveLlm()) return null;
  const nim = await nimChat({
    system: CRITIC_SYSTEM,
    user: `Rewrite this alpha. Expression: ${parent.expression}. Rationale: ${parent.rationale}. Category: ${parent.category}. JSON only.`,
    temperature: 0.4,
    maxTokens: 400,
  });
  if (!nim.ok) return null;
  try {
    const raw = JSON.parse(extractJsonObject(nim.text)) as {
      expression?: string;
      label?: string;
      note?: string;
    };
    if (!raw.expression) return null;
    parse(raw.expression);
    return {
      expression: raw.expression,
      label: raw.label ?? "nim rewrite",
      note: (raw.note ?? "NIM critic rewrite").slice(0, 180),
    };
  } catch {
    return null;
  }
}

const SEED_IDS = new Set(SEED_LIBRARY.map((s) => s.id));

export async function POST(req: Request) {
  const body = (await req.json()) as Body;
  const parent = body.parent;
  const pool = body.pool ?? [];
  const generation = body.generation ?? 0;
  if (!parent?.expression) {
    return Response.json({ ok: false, message: "missing parent" }, { status: 400 });
  }

  const taken = new Set(pool.map((s) => s.expression));
  taken.add(parent.expression);

  const llm = await llmRewrite(parent);
  const mock = criticRewrite(parent.expression, generation, taken);
  const mut =
    llm && llm.expression.replace(/\s+/g, "") !== parent.expression.replace(/\s+/g, "")
      ? { ...llm, source: "llm" as const }
      : { ...mock, source: "mock" as const };

  const id = nextRefinedId(parent.id, [...pool.map((s) => s.id), parent.id]);
  const child: SeedAlpha = {
    id,
    name: `${parent.name} · ${mut.label}`,
    category: parent.category,
    expression: mut.expression,
    source: parent.source === "paper" ? "wq" : parent.source,
    rationale: mut.note,
    parentId: parent.id,
    generation: (parent.generation ?? 0) + 1,
    mutation: mut.label,
  };

  const nextPool = [...pool.filter((s) => s.id !== id), child];
  const { universe, meta } = getActiveUniverse();
  const result = runPipelineFromSeeds(universe, nextPool, mut.source === "llm", meta);
  const evaluated = result.evaluated.find((a) => a.id === id) ?? result.evaluated[0];

  const extras = result.evaluated
    .filter((a) => !SEED_IDS.has(a.id))
    .map((a) => ({
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
    {
      extras,
      selectedId: child.id,
      expression: child.expression,
      llmUsed: mut.source === "llm",
    },
    {
      at: new Date().toISOString(),
      kind: "refine",
      note: `refine ${parent.id} → ${id} · ${mut.label}`,
      extraIds: [child.id],
      selectedId: child.id,
      sharpe: evaluated?.metrics.sharpe,
    },
  );

  return Response.json({
    ok: true,
    demo: mut.source === "mock",
    live: mut.source === "llm",
    provider: mut.source === "llm" ? "nvidia" : "mock",
    mutation: mut.label,
    child,
    alpha: evaluated,
    result,
    message: `refine ${parent.id} → ${id} · ${mut.label}`,
  });
}
