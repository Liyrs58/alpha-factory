import { emptySession, loadSession, saveSession, upsertSession } from "@/lib/store/session";
import type { LabSession } from "@/lib/store/types";

export const runtime = "nodejs";

export async function GET() {
  return Response.json(loadSession());
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as Partial<LabSession> & { run?: LabSession["runs"][number] };
    const { run, ...patch } = body;
    if (patch.version && patch.version !== 1) {
      return Response.json({ ok: false, message: "unsupported session version" }, { status: 400 });
    }
    const saved = upsertSession(patch, run);
    return Response.json(saved);
  } catch {
    return Response.json(saveSession(emptySession()), { status: 200 });
  }
}
