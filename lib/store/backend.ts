/**
 * Optional durable JSON store.
 * Prefer @vercel/blob when BLOB_READ_WRITE_TOKEN is set; otherwise ephemeral
 * data/ + /tmp JSON (lost on serverless cold start).
 */

import { readJsonFile, removeJsonFile, writeJsonFile } from "./fsjson";

const PREFIX = "alpha-factory/";

export type StoreBackend = "blob" | "ephemeral";

export function blobToken(): string | null {
  const t = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  return t || null;
}

export function storeBackend(): StoreBackend {
  return blobToken() ? "blob" : "ephemeral";
}

export function isDurableStore(): boolean {
  return storeBackend() === "blob";
}

function pathnameFor(name: string): string {
  return `${PREFIX}${name.replace(/^\/+/, "")}`;
}

async function blobReadText(name: string): Promise<string | null> {
  const token = blobToken();
  if (!token) return null;
  const pathname = pathnameFor(name);
  const { get, list } = await import("@vercel/blob");
  for (const access of ["public", "private"] as const) {
    try {
      const result = await get(pathname, { access, useCache: false, token });
      if (result?.statusCode === 200 && result.stream) {
        return await new Response(result.stream).text();
      }
    } catch {
      /* try next access / list */
    }
  }
  try {
    const { blobs } = await list({ prefix: pathname, limit: 20, token });
    const hit = blobs.find((b) => b.pathname === pathname || b.pathname.endsWith(`/${name}`));
    if (!hit) return null;
    const res = await fetch(hit.url, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function blobWriteText(name: string, body: string): Promise<boolean> {
  const token = blobToken();
  if (!token) return false;
  const pathname = pathnameFor(name);
  const { put } = await import("@vercel/blob");
  const base = {
    addRandomSuffix: false as const,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 0,
    token,
  };
  try {
    await put(pathname, body, { ...base, access: "public" });
    return true;
  } catch {
    try {
      await put(pathname, body, { ...base, access: "private" });
      return true;
    } catch {
      return false;
    }
  }
}

async function blobRemove(name: string): Promise<void> {
  const token = blobToken();
  if (!token) return;
  const pathname = pathnameFor(name);
  const { del, list } = await import("@vercel/blob");
  try {
    const { blobs } = await list({ prefix: pathname, limit: 20, token });
    const urls = blobs
      .filter((b) => b.pathname === pathname || b.pathname.endsWith(`/${name}`))
      .map((b) => b.url);
    if (urls.length) await del(urls, { token });
  } catch {
    try {
      await del(pathname, { token });
    } catch {
      /* ignore */
    }
  }
}

export async function readJson<T>(name: string): Promise<T | null> {
  if (blobToken()) {
    const text = await blobReadText(name);
    if (text) {
      try {
        return JSON.parse(text) as T;
      } catch {
        /* fall through */
      }
    }
  }
  return readJsonFile<T>(name);
}

export async function writeJson(name: string, value: unknown): Promise<StoreBackend> {
  const payload = JSON.stringify(value);
  if (blobToken()) {
    const ok = await blobWriteText(name, payload);
    if (ok) return "blob";
  }
  writeJsonFile(name, value);
  return "ephemeral";
}

export async function removeJson(name: string): Promise<void> {
  if (blobToken()) await blobRemove(name);
  removeJsonFile(name);
}
