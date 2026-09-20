import { scratchBacktest } from "@/lib/agents/pipeline";
import { getActiveUniverse } from "@/lib/data/active";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let expression = "";
  try {
    const body = (await req.json()) as { expression?: string };
    expression = (body.expression ?? "").trim();
  } catch {
    expression = "";
  }
  if (!expression) {
    return Response.json({ ok: false, message: "missing expression" }, { status: 400 });
  }
  try {
    const { universe, meta } = await getActiveUniverse();
    const alpha = scratchBacktest(universe, expression);
    return Response.json({ ok: true, alpha, meta });
  } catch (e) {
    return Response.json(
      { ok: false, message: e instanceof Error ? e.message : "eval failed" },
      { status: 400 },
    );
  }
}
