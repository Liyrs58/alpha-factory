import { parse } from "@/lib/alphas/parser";
import { mockPropose } from "@/lib/agents/propose-mock";
import { isLiveLlm } from "@/lib/flags";
import { extractJsonObject, nimChat, nvidiaModel } from "@/lib/llm/nvidia";
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
      rationale: (a.rationale ?? "NIM proposed").slice(0, 180),
    });
  }
  return out.slice(0, 6);
}

export async function POST(req: Request) {
  let offset = 0;
  try {
    const body = (await req.json()) as { offset?: number };
    offset = body.offset ?? 0;
  } catch {
    offset = 0;
  }

  if (!isLiveLlm()) {
    const alphas = mockPropose(offset, 4);
    return Response.json({
      ok: true,
      demo: true,
      live: false,
      provider: "mock",
      alphas,
      message: `mock LLM · ${alphas.map((a) => a.id).join(",")}`,
    });
  }

  const nim = await nimChat({
    system: SYSTEM,
    user: "Propose 4 new formulaic alphas for a 10-name synthetic US-style universe. Avoid duplicating close-delay(close,14) and sma(close,20)-close. JSON only.",
    temperature: 0.7,
    maxTokens: 1200,
  });

  if (!nim.ok) {
    const alphas = mockPropose(offset, 4);
    return Response.json({
      ok: true,
      demo: true,
      live: false,
      provider: "mock",
      alphas,
      message: `${nim.message} · mock fallback`,
    });
  }

  try {
    const payload = JSON.parse(extractJsonObject(nim.text)) as Payload;
    const alphas = sanitize(payload);
    if (alphas.length === 0) {
      return Response.json({
        ok: true,
        demo: true,
        live: false,
        provider: "mock",
        alphas: mockPropose(offset, 4),
        message: "NIM output failed parse · mock fallback",
      });
    }
    return Response.json({
      ok: true,
      demo: false,
      live: true,
      provider: "nvidia",
      model: nvidiaModel(),
      alphas,
      message: `NIM ${nvidiaModel()} · ${alphas.length} formulas`,
    });
  } catch (err) {
    return Response.json({
      ok: true,
      demo: true,
      live: false,
      provider: "mock",
      alphas: mockPropose(offset, 4),
      message: err instanceof Error ? err.message : "propose failed · mock fallback",
    });
  }
}
