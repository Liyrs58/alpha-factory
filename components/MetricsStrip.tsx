import { clsx, fmtNum, fmtPct } from "@/lib/format";
import type { AlphaMetrics } from "@/lib/types";

export function MetricsStrip({
  book,
  bench,
}: {
  book: AlphaMetrics;
  bench: AlphaMetrics;
}) {
  const cells: { k: string; v: string; cls?: string }[] = [
    { k: "RET", v: fmtPct(book.totalReturn, 1), cls: book.totalReturn < 0 ? "text-rust" : "text-paper" },
    {
      k: "SHARPE",
      v: fmtNum(book.sharpe, 2),
      cls: book.sharpe > 0 ? "text-signal" : "text-rust",
    },
    { k: "IC", v: fmtNum(book.ic, 3), cls: book.ic < 0 ? "text-rust" : "text-paper" },
    { k: "IR", v: fmtNum(book.ir, 2), cls: book.ir < 0 ? "text-rust" : "text-paper" },
    { k: "MDD", v: fmtPct(book.maxDrawdown, 1), cls: "text-rust" },
    { k: "VOL", v: fmtPct(book.annVol, 1) },
    { k: "CALMAR", v: fmtNum(book.calmar, 2), cls: book.calmar < 0 ? "text-rust" : "text-paper" },
    { k: "HIT", v: fmtPct(book.hitRate, 0) },
    { k: "BENCH SH", v: fmtNum(bench.sharpe, 2), cls: bench.sharpe > 0 ? "text-signal" : "text-rust" },
  ];

  return (
    <dl className="grid grid-cols-3 gap-px bg-line sm:grid-cols-9">
      {cells.map((c) => (
        <div key={c.k} className="bg-charcoal-2 px-2 py-2">
          <dt className="font-formula text-[9px] tracking-[0.14em] text-faint">{c.k}</dt>
          <dd className={clsx("font-formula text-[13px] tabular-nums", c.cls ?? "text-paper")}>{c.v}</dd>
        </div>
      ))}
    </dl>
  );
}
