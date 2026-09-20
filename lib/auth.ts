/**
 * Optional demo gate. Unset DEMO_ACCESS_CODE → public.
 * When set, require AUTH_SECRET-signed cookie (AUTH_SECRET falls back to a
 * digest of the access code so a single env var still works).
 */

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const GATE_COOKIE = "af_gate";
const COOKIE_TTL_SEC = 60 * 60 * 24 * 7;
const COOKIE_VER = "v1";

export function demoAccessCode(): string | null {
  const c = process.env.DEMO_ACCESS_CODE?.trim();
  return c || null;
}

export function authRequired(): boolean {
  return Boolean(demoAccessCode());
}

export function authSecret(): string | null {
  const explicit = process.env.AUTH_SECRET?.trim();
  if (explicit) return explicit;
  const code = demoAccessCode();
  if (!code) return null;
  return createHash("sha256").update(`alpha-factory-gate:${code}`).digest("hex");
}

function sha256buf(s: string): Buffer {
  return createHash("sha256").update(s).digest();
}

export function accessCodeValid(input: string): boolean {
  const expected = demoAccessCode();
  if (!expected) return true;
  const a = sha256buf(input.trim());
  const b = sha256buf(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function hmacHex(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function hexEqual(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    return ba.length === bb.length && ba.length > 0 && timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

export function signGateCookie(now = Date.now()): string | null {
  const secret = authSecret();
  if (!secret) return null;
  const exp = Math.floor(now / 1000) + COOKIE_TTL_SEC;
  const payload = `${COOKIE_VER}|${exp}`;
  return `${COOKIE_VER}.${exp}.${hmacHex(secret, payload)}`;
}

export function verifyGateCookie(raw: string | undefined | null, now = Date.now()): boolean {
  if (!authRequired()) return true;
  const secret = authSecret();
  if (!secret || !raw) return false;
  const parts = raw.split(".");
  if (parts.length !== 3) return false;
  const [ver, expStr, mac] = parts;
  if (ver !== COOKIE_VER || !expStr || !mac) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp * 1000 < now) return false;
  const expected = hmacHex(secret, `${COOKIE_VER}|${exp}`);
  return hexEqual(mac, expected);
}

export function gateCookieHeader(value: string, maxAge = COOKIE_TTL_SEC): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${GATE_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function clearGateCookieHeader(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${GATE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function isPublicPath(pathname: string): boolean {
  if (pathname === "/login" || pathname.startsWith("/login/")) return true;
  if (pathname === "/api/auth" || pathname.startsWith("/api/auth/")) return true;
  if (pathname === "/api/flags" || pathname.startsWith("/api/flags/")) return true;
  if (pathname === "/api/health" || pathname.startsWith("/api/health/")) return true;
  return false;
}

export function unauthorized(): Response {
  return Response.json({ ok: false, message: "auth required" }, { status: 401 });
}

export function gateFromRequest(req: Request): boolean {
  if (!authRequired()) return true;
  const cookie = req.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${GATE_COOKIE}=([^;]+)`));
  return verifyGateCookie(match?.[1] ? decodeURIComponent(match[1]) : null);
}
