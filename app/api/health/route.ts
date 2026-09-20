import { publicFlags } from "@/lib/flags";
import { authRequired } from "@/lib/auth";
import { isDurableStore, storeBackend } from "@/lib/store/backend";

export const runtime = "nodejs";

export async function GET() {
  const flags = publicFlags();
  return Response.json({
    ok: true,
    liveTrading: flags.liveTrading,
    llm: flags.llm,
    provider: flags.provider,
    model: flags.model,
    store: {
      durable: isDurableStore(),
      backend: storeBackend(),
    },
    auth: { required: authRequired() },
    paper: flags.paper,
  });
}
