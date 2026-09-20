import { publicFlags } from "@/lib/flags";

export const runtime = "nodejs";

export async function GET() {
  return Response.json(publicFlags());
}
