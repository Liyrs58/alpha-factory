import { LIVE_TRADING } from "@/lib/flags";
import {
  paperMode,
  readPaperAccount,
  submitPaperOrder,
  type PaperOrder,
} from "@/lib/broker/alpaca";
import { researchBookOrders } from "@/lib/broker/book";
import { getActiveUniverse } from "@/lib/data/active";
import { runPipeline } from "@/lib/agents/pipeline";
import { loadSession } from "@/lib/store/session";
import type { SeedAlpha } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  const acc = await readPaperAccount();
  return Response.json({
    ok: acc.ok,
    liveTrading: LIVE_TRADING,
    mode: paperMode(),
    account: acc.account,
    message: acc.ok ? undefined : acc.reason,
  });
}

type Body = {
  confirm?: boolean;
  fromBook?: boolean;
  symbol?: string;
  side?: "buy" | "sell";
  qty?: number;
  orders?: PaperOrder[];
};

export async function POST(req: Request) {
  if (LIVE_TRADING) {
    return Response.json({ ok: false, message: "LIVE_TRADING=false" }, { status: 403 });
  }
  const mode = paperMode();
  if (mode === "off") {
    return Response.json({ ok: false, message: "PAPER_BROKER=off" }, { status: 400 });
  }

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    body = {};
  }
  if (!body.confirm) {
    return Response.json(
      { ok: false, message: "explicit confirm required (Paper submit)" },
      { status: 400 },
    );
  }

  const { universe, meta } = await getActiveUniverse();
  const orders: PaperOrder[] = [];

  if (Array.isArray(body.orders) && body.orders.length) {
    for (const o of body.orders) {
      if (o?.symbol) {
        orders.push({
          symbol: o.symbol,
          side: o.side === "sell" ? "sell" : "buy",
          qty: Number(o.qty) || 1,
          type: "market",
        });
      }
    }
  } else if (body.symbol) {
    orders.push({
      symbol: body.symbol,
      side: body.side === "sell" ? "sell" : "buy",
      qty: Number(body.qty) || 1,
      type: "market",
    });
  } else {
    const session = await loadSession();
    const extras: SeedAlpha[] = session.extras ?? [];
    const result = runPipeline(universe, extras, session.llmUsed, meta);
    orders.push(...researchBookOrders(universe, result.book, Number(body.qty) || 1));
  }

  if (!orders.length) {
    return Response.json({ ok: false, message: "no paper orders to submit" }, { status: 400 });
  }

  const fills = [];
  for (const order of orders.slice(0, 8)) {
    fills.push(await submitPaperOrder(order, meta.source));
  }
  const acc = await readPaperAccount();
  const ok = fills.every((f) => f.ok);
  return Response.json({
    ok,
    liveTrading: LIVE_TRADING,
    mode,
    fills,
    account: acc.account,
    message: ok
      ? `paper ${fills.length} fill(s) · ${mode}`
      : fills.find((f) => !f.ok)?.reason ?? "paper submit failed",
  });
}
