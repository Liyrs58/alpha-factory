import { UNIVERSE } from "@/lib/data/universe";
import { criticRewrite, nextRefinedId } from "@/lib/agents/mutate";
import { runPipelineFromSeeds } from "@/lib/agents/pipeline";
import { parse } from "@/lib/alphas/parser";
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
  const openai = process.env.OPENAI_API_KEY;
  const anthropic = process.env.ANTHROPIC_API_KEY;
  if (!openai && !anthropic) return null;
  try {
    let text = "";
    if (openai) {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openai}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
          temperature: 0.4,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: CRITIC_SYSTEM },
            {
              role: "user",
              content: `Rewrite this alpha. Expression: ${parent.expression}. Rationale: ${parent.rationale}. Category: ${parent.category}.`,
            },
          ],
        }),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      text = json.choices?.[0]?.message?.content ?? "";
    } else if (anthropic) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": anthropic,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5-20250929",
          max_tokens: 400,
          system: CRITIC_SYSTEM,
          messages: [
            {
              role: "user",
              content: `Rewrite this alpha. Expression: ${parent.expression}. JSON only.`,
            },
          ],
        }),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { content?: { type: string; text?: string }[] };
      text = json.content?.find((c) => c.type === "text")?.text ?? "";
    }
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    const raw = JSON.parse(start >= 0 ? text.slice(start, end + 1) : "{}") as {
      expression?: string;
      label?: string;
      note?: string;
    };
    if (!raw.expression) return null;
    parse(raw.expression);
    return {
      expression: raw.expression,
      label: raw.label ?? "llm rewrite",
      note: (raw.note ?? "LLM critic rewrite").slice(0, 180),
    };
  } catch {
    return null;
  }
}

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
  const result = runPipelineFromSeeds(UNIVERSE, nextPool, mut.source === "llm");
  const evaluated = result.evaluated.find((a) => a.id === id) ?? result.evaluated[0];

  return Response.json({
    ok: true,
    demo: mut.source === "mock",
    mutation: mut.label,
    child,
    alpha: evaluated,
    result,
    message: `refine ${parent.id} → ${id} · ${mut.label}`,
  });
}
