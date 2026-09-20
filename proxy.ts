import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { authRequired, GATE_COOKIE, isPublicPath, verifyGateCookie } from "@/lib/auth";

export function proxy(request: NextRequest) {
  if (!authRequired()) return NextResponse.next();
  const path = request.nextUrl.pathname;
  if (isPublicPath(path)) return NextResponse.next();
  const cookie = request.cookies.get(GATE_COOKIE)?.value;
  if (verifyGateCookie(cookie)) return NextResponse.next();
  if (path.startsWith("/api/")) {
    return NextResponse.json({ ok: false, message: "auth required" }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  if (path !== "/") url.searchParams.set("next", path);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
