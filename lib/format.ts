export function fmtNum(x: number, d = 2): string {
  if (!Number.isFinite(x)) return "—";
  return x.toFixed(d);
}

export function fmtPct(x: number, d = 1): string {
  if (!Number.isFinite(x)) return "—";
  const v = x * 100;
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(d)}%`;
}

export function fmtIc(x: number): string {
  if (!Number.isFinite(x)) return "—";
  return (x >= 0 ? "+" : "") + x.toFixed(3);
}

export function clsx(...xs: Array<string | false | null | undefined>): string {
  return xs.filter(Boolean).join(" ");
}
