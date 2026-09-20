import {
  accessCodeValid,
  authRequired,
  clearGateCookieHeader,
  gateCookieHeader,
  signGateCookie,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  return Response.json({ ok: true, required: authRequired() });
}

export async function POST(req: Request) {
  if (!authRequired()) {
    return Response.json({ ok: true, required: false, message: "public" });
  }
  let code = "";
  try {
    const body = (await req.json()) as { code?: string };
    code = String(body.code ?? "");
  } catch {
    code = "";
  }
  if (!accessCodeValid(code)) {
    return Response.json({ ok: false, message: "invalid access code" }, { status: 401 });
  }
  const token = signGateCookie();
  if (!token) {
    return Response.json({ ok: false, message: "AUTH_SECRET missing" }, { status: 500 });
  }
  return new Response(JSON.stringify({ ok: true, required: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": gateCookieHeader(token),
    },
  });
}

export async function DELETE() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": clearGateCookieHeader(),
    },
  });
}
