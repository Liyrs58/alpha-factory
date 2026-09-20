import { universeFromCsv } from "@/lib/data/csv";
import { getActiveUniverse, resetUploadedUniverse, setUploadedUniverse } from "@/lib/data/active";
import { upsertSession } from "@/lib/store/session";

export const runtime = "nodejs";

export async function GET() {
  const { meta } = await getActiveUniverse();
  return Response.json({
    ok: true,
    meta: {
      source: meta.source,
      nS: meta.nS,
      nT: meta.nT,
      tickers: meta.tickers,
      start: meta.dates[0] ?? "",
      end: meta.dates[meta.dates.length - 1] ?? "",
    },
  });
}

export async function POST(req: Request) {
  let csv = "";
  const ctype = req.headers.get("content-type") ?? "";
  try {
    if (ctype.includes("application/json")) {
      const body = (await req.json()) as { csv?: string };
      csv = body.csv ?? "";
    } else {
      csv = await req.text();
    }
  } catch {
    return Response.json({ ok: false, message: "invalid body" }, { status: 400 });
  }
  const parsed = universeFromCsv(csv);
  if (!parsed.ok) {
    return Response.json({ ok: false, message: parsed.message }, { status: 400 });
  }
  await setUploadedUniverse(parsed.universe);
  const { meta } = await getActiveUniverse();
  await upsertSession(
    {},
    {
      at: new Date().toISOString(),
      kind: "universe",
      note: `upload ${meta.nS} names × ${meta.nT} days`,
      extraIds: [],
    },
  );
  return Response.json({ ok: true, meta });
}

export async function DELETE() {
  await resetUploadedUniverse();
  const { meta } = await getActiveUniverse();
  await upsertSession(
    {},
    {
      at: new Date().toISOString(),
      kind: "universe",
      note: "reset DEMO10",
      extraIds: [],
    },
  );
  return Response.json({ ok: true, meta });
}
