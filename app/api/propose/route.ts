import { parse } from "@/lib/alphas/parser";
import type { Category, SeedAlpha } from "@/lib/types";

export const runtime = "nodejs";

const SYSTEM = `You emit formulaic alpha factors for a cross-sectional equity book.
Return JSON only: {"alphas":[{"name":string,"category":"momentum"|"meanrev"|"volatility"|"liquidity"|"technical"|"quality","expression":string,"rationale":string}]}
Rules:
- 4 alphas, diverse categories.
- expression is a single executable formula. Allowed fields: open, high, low, close, volume, vwap, returns, rsi, atr, boll_up, boll_down, macd, typical.
- Allowed functions: delay, ts_delta, ts_mean, sma, std, ts_std, ts_sum, ts_max, ts_min, ts_rank, rank, zscore, scale, abs, log, sign, sqrt, signedpower, correlation, ema, rsi, atr, if.
- No assignment, no comments, no dollar signs, no stock identifiers.
- Prefer WorldQuant-style skeletons e.g. rank(ts_delta(close, 5)) - rank(volume).`;

type Payload = {
  alphas?: Array<{
    name?: string;
    category?: string;
    expression?: string;
    rationale?: string;
  }>;
};

const CATS = new Set<Category>([
  "momentum",
  "meanrev",
  "volatility",
  "liquidity",
  "technical",
  "quality",
]);

function sanitize(raw: Payload): SeedAlpha[] {
  const out: SeedAlpha[] = [];
  for (const [i, a] of (raw.alphas ?? []).entries()) {
    const expression = (a.expression ?? "").trim();
    if (!expression) continue;
    try {
      parse(expression);
    } catch {
      continue;
    }
    const category = CATS.has(a.category as Category) ? (a.category as Category) : "technical";
    out.push({
      id: `L${String(i + 1).padStart(2, "0")}`,
      name: (a.name ?? `llm ${i + 1}`).slice(0, 48),
      category,
      expression,
      source: "llm",
      rationale: (a.rationale ?? "LLM proposed").slice(0, 180),
    });
  }
  return out.slice(0, 6);
}

export async function POST() {
  const openai = process.env.OPENAI_API_KEY;
  const anthropic = process.env.ANTHROPIC_API_KEY;

  if (!openai && !anthropic) {
    return Response.json({
      ok: false,
      demo: true,
      alphas: [] as SeedAlpha[],
      message: "No OPENAI_API_KEY or ANTHROPIC_API_KEY. Demo library used.",
    });
  }

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
          temperature: 0.7,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM },
            {
              role: "user",
              content:
                "Propose 4 new formulaic alphas for a 10-name synthetic US-style universe. Avoid duplicating close-delay(close,14) and sma(close,20)-close.",
            },
          ],
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        return Response.json({ ok: false, demo: true, alphas: [], message: err.slice(0, 240) }, { status: 200 });
      }
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      text = json.choices?.[0]?.message?.content ?? "{}";
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
          max_tokens: 1200,
          system: SYSTEM,
          messages: [
            {
              role: "user",
              content:
                "Propose 4 new formulaic alphas for a 10-name synthetic US-style universe. JSON only.",
            },
          ],
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        return Response.json({ ok: false, demo: true, alphas: [], message: err.slice(0, 240) }, { status: 200 });
      }
      const json = (await res.json()) as { content?: { type: string; text?: string }[] };
      text = json.content?.find((c) => c.type === "text")?.text ?? "{}";
    }

    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    const payload = JSON.parse(start >= 0 ? text.slice(start, end + 1) : "{}") as Payload;
    const alphas = sanitize(payload);
    return Response.json({
      ok: alphas.length > 0,
      demo: false,
      alphas,
      message: alphas.length ? `accepted ${alphas.length} parseable formulas` : "LLM output failed parse",
    });
  } catch (err) {
    return Response.json({
      ok: false,
      demo: true,
      alphas: [],
      message: err instanceof Error ? err.message : "propose failed",
    });
  }
}
