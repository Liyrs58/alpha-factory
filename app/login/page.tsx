"use client";

import { useState } from "react";

export default function LoginPage() {
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const json = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || !json.ok) {
        setErr(json.message ?? "invalid access code");
        return;
      }
      const next = new URLSearchParams(window.location.search).get("next") || "/";
      window.location.assign(next.startsWith("/") ? next : "/");
    } catch {
      setErr("auth offline");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-dvh place-items-center bg-charcoal px-4 text-paper">
      <form
        className="w-full max-w-sm rounded-[4px] bg-paper p-5 text-ink"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="mb-3 font-formula text-[11px] tracking-[0.16em] text-[#6b675e]">
          ALPHA FACTORY · GATE
        </div>
        <p className="mb-4 text-[13px] leading-5 text-[#3a3832]">
          Optional demo access code. Unset <span className="font-formula">DEMO_ACCESS_CODE</span> to
          keep the lab public.
        </p>
        <label className="block font-formula text-[10px] tracking-wide text-[#6b675e]" htmlFor="gate-code">
          ACCESS CODE
        </label>
        <input
          id="gate-code"
          type="password"
          autoComplete="current-password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="mt-1 w-full border border-[#d4cfc4] bg-[#efebe3] px-2 py-1.5 font-formula text-[13px] text-ink outline-none focus:border-ink"
        />
        {err && <p className="mt-2 font-formula text-[11px] text-rust">{err}</p>}
        <button
          type="submit"
          disabled={busy}
          className="mt-4 w-full bg-ink px-3 py-2 font-formula text-[11px] tracking-wide text-paper hover:bg-charcoal disabled:opacity-40"
        >
          {busy ? "CHECKING…" : "ENTER"}
        </button>
      </form>
    </main>
  );
}
