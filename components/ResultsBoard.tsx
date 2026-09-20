"use client";

import { FormulaText } from "@/components/FormulaText";
import { clsx, fmtNum, fmtPct } from "@/lib/format";
import type { EvaluatedAlpha } from "@/lib/types";

export function ResultsBoard({
  rows,
  selectedId,
  onSelect,
  lastRun,
  period,
  filter,
  onFilter,
  pinnedDecile,
  onPinDecile,
}: {
  rows: EvaluatedAlpha[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  lastRun: string;
  period: string;
  filter: "all" | "passed" | "dropped";
  onFilter: (f: "all" | "passed" | "dropped") => void;
  pinnedDecile: { i: number; v: number } | null;
  onPinDecile: (i: number, v: number) => void;
}) {
  const selected = rows.find((a) => a.id === selectedId) ?? rows[0];
  const shown = rows.filter((a) => {
    if (filter === "passed") return a.scores.passed;
    if (filter === "dropped") return !a.scores.passed;
    return true;
  });
  const deciles = selected?.deciles ?? Array.from({ length: 10 }, () => 0);
  const maxAbs = Math.max(0.0001, ...deciles.map((d) => Math.abs(d)));

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-[4px] border border-line bg-[#16181f]">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-3 py-1.5 font-formula text-[10px] tracking-wide text-mute">
        <span className="text-paper">RESULTS</span>
        <span>LAST RUN: {lastRun}</span>
        <span>UNIVERSE: DEMO10</span>
        <span>PERIOD: {period}</span>
        <span className="ml-auto flex gap-1">
          {(["all", "passed", "dropped"] as const).map((f) => (
            <button
              key={f}
              type="button"
              aria-label={`Filter ${f.toUpperCase()}`}
              aria-pressed={filter === f}
              onClick={() => onFilter(f)}
              className={clsx(
                "px-1.5 py-0.5 uppercase",
                filter === f ? "bg-paper text-ink" : "text-faint hover:text-paper",
              )}
            >
              {f.toUpperCase()}
            </button>
          ))}
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[640px] border-collapse text-left text-[11px]">
          <thead className="sticky top-0 bg-[#16181f] font-formula text-[10px] tracking-wider text-faint">
            <tr className="border-b border-line">
              <th className="px-2 py-1.5 font-medium">ALPHA ID</th>
              <th className="px-2 py-1.5 font-medium">DESCRIPTION</th>
              <th className="px-2 py-1.5 font-medium text-right">SHARPE</th>
              <th className="px-2 py-1.5 font-medium text-right">MAXDD</th>
              <th className="px-2 py-1.5 font-medium text-right">TURNOVER</th>
              <th className="px-2 py-1.5 font-medium text-right">IR (t+1)</th>
              <th className="px-2 py-1.5 font-medium text-right">FITNESS</th>
              <th className="px-2 py-1.5 font-medium">STATUS</th>
            </tr>
          </thead>
          <tbody className="font-formula">
            {shown.map((a) => {
              const on = a.id === selectedId;
              return (
                <tr
                  key={a.id}
                  onClick={() => onSelect(a.id)}
                  className={clsx(
                    "cursor-pointer border-b border-line/80 hover:bg-[#1c1f28]",
                    on && "bg-[#22252e]",
                  )}
                >
                  <td className="whitespace-nowrap px-2 py-1.5 text-paper">
                    <span
                      className={clsx(
                        "mr-2 inline-block h-[7px] w-[7px] rounded-full",
                        a.scores.passed ? "bg-signal" : "bg-line",
                      )}
                    />
                    ALP-{a.id}
                  </td>
                  <td className="max-w-[280px] truncate px-2 py-1.5">
                    <FormulaText src={a.expression} surface="dark" />
                  </td>
                  <td
                    className={clsx(
                      "px-2 py-1.5 text-right tabular-nums",
                      a.metrics.sharpe > 0 ? "text-signal" : "text-rust",
                    )}
                  >
                    {fmtNum(a.metrics.sharpe, 2)}
                  </td>
                  <td className="px-2 py-1.5 text-right text-rust tabular-nums">
                    {fmtPct(a.metrics.maxDrawdown, 1)}
                  </td>
                  <td className="px-2 py-1.5 text-right text-mute tabular-nums">
                    {Math.round(a.metrics.turnover * 100)}%
                  </td>
                  <td
                    className={clsx(
                      "px-2 py-1.5 text-right tabular-nums",
                      a.metrics.ir > 0 ? "text-paper" : "text-rust",
                    )}
                  >
                    {fmtNum(a.metrics.ir, 2)}
                  </td>
                  <td className="px-2 py-1.5 text-right text-paper tabular-nums">
                    {fmtNum(a.scores.final, 2)}
                  </td>
                  <td
                    className={clsx(
                      "px-2 py-1.5",
                      a.scores.passed ? "text-paper" : "text-rust",
                    )}
                  >
                    {a.scores.passed ? "✓ PASSED" : "DROPPED"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="border-t border-line px-3 py-2">
        <div className="mb-1 font-formula text-[10px] tracking-[0.14em] text-faint">
          SIGNAL DISTRIBUTION (DECILES)
        </div>
        <div className="flex h-[72px] items-end gap-1">
          {(() => {
            const ranked = deciles
              .map((d, i) => ({ d, i }))
              .sort((a, b) => b.d - a.d);
            const green = new Set(
              ranked.filter((x) => x.d > 0).slice(0, 2).map((x) => x.i),
            );
            const rustI = ranked[ranked.length - 1]!.d < 0 ? ranked[ranked.length - 1]!.i : -1;
            return deciles.map((d, i) => {
              const barH = Math.max(8, (Math.abs(d) / maxAbs) * 64);
              const cls = green.has(i) ? "bg-signal" : i === rustI ? "bg-rust" : "bg-[#4a4e57]";
              return (
                <button
                  key={i}
                  type="button"
                  aria-label={`Decile ${i + 1}`}
                  onClick={() => onPinDecile(i, d)}
                  className="flex h-full min-h-[72px] flex-1 flex-col items-center justify-end gap-1"
                  title={`D${i + 1} ${d >= 0 ? "+" : ""}${(d * 10000).toFixed(1)} bps`}
                >
                  <div
                    className={clsx("w-full rounded-[1px]", cls, pinnedDecile?.i === i && "outline outline-1 outline-paper")}
                    style={{ height: barH }}
                  />
                  <span className="font-formula text-[9px] text-faint">{i + 1}</span>
                </button>
              );
            });
          })()}
        </div>
        {selected && (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-formula text-[10px] text-mute">
            <span>IC MEAN: {fmtNum(selected.metrics.ic, 3)}</span>
            <span>IC STD: {fmtNum(selected.metrics.icStd, 3)}</span>
            <span>T-STAT: {fmtNum(selected.metrics.tstat, 2)}</span>
            <span>% PROFITABLE DAYS: {fmtPct(selected.metrics.hitRate, 1)}</span>
            <span>TURNOVER: {Math.round(selected.metrics.turnover * 100)}%</span>
            {pinnedDecile && (
              <span>
                D{pinnedDecile.i + 1}: {(pinnedDecile.v * 1e4).toFixed(1)} bps/day
              </span>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
