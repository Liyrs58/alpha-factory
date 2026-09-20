"use client";

import { FormulaText } from "@/components/FormulaText";
import { clsx, fmtNum, fmtPct } from "@/lib/format";
import type { EvaluatedAlpha } from "@/lib/types";

const COLS =
  "grid-cols-[6.75rem_minmax(0,1fr)_3.6rem_3.6rem_3.6rem_3.4rem_3.4rem_4.6rem]";

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
    <section className="relative z-20 grid h-full min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-[4px] border border-line bg-[#16181f]">
      <header className="relative z-20 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-3 py-1.5 font-formula text-[10px] tracking-wide text-mute">
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
                "relative z-20 pointer-events-auto px-1.5 py-0.5 uppercase",
                filter === f ? "bg-paper text-ink" : "text-faint hover:text-paper",
              )}
            >
              {f.toUpperCase()}
            </button>
          ))}
        </span>
      </header>

      <div className="relative z-0 grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
        <div className={`pointer-events-none grid ${COLS} w-full max-w-full min-w-0 gap-0 border-b border-line bg-[#16181f] px-2 py-1.5 font-formula text-[10px] tracking-wider text-faint`}>
          <span>ALPHA ID</span>
          <span>DESCRIPTION</span>
          <span className="text-right">SHARPE</span>
          <span className="text-right">MAXDD</span>
          <span className="text-right">TURNOVER</span>
          <span className="text-right">IR (t+1)</span>
          <span className="text-right">FITNESS</span>
          <span>STATUS</span>
        </div>
        <div className="min-h-0 min-w-0 overflow-x-hidden overflow-y-auto" data-results-scroll>
          {shown.map((a) => {
            const on = a.id === selectedId;
            const refined = Boolean(a.parentId || a.mutation);
            return (
              <button
                key={a.id}
                type="button"
                aria-pressed={on}
                data-alpha-id={a.id}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onSelect(a.id);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(a.id);
                }}
                className={clsx(
                  `relative z-0 grid ${COLS} w-full max-w-full min-w-0 cursor-pointer overflow-hidden border-b border-line/80 px-2 py-1.5 text-left font-formula text-[11px] hover:bg-[#1c1f28]`,
                  on && "bg-[#22252e]",
                  refined && "border-l-2 border-l-signal",
                )}
              >
                <span className="flex min-w-0 items-center whitespace-nowrap text-paper">
                  <span
                    className={clsx(
                      "mr-2 inline-block h-[7px] w-[7px] shrink-0 rounded-full",
                      a.scores.passed ? "bg-signal" : "bg-line",
                    )}
                  />
                  ALP-{a.id}
                </span>
                <span className="min-w-0 truncate">
                  <FormulaText src={a.expression} surface="dark" />
                </span>
                <span
                  className={clsx(
                    "text-right tabular-nums",
                    a.metrics.sharpe > 0 ? "text-signal" : "text-rust",
                  )}
                >
                  {fmtNum(a.metrics.sharpe, 2)}
                </span>
                <span className="text-right text-rust tabular-nums">
                  {fmtPct(a.metrics.maxDrawdown, 1)}
                </span>
                <span className="text-right text-mute tabular-nums">
                  {Math.round(a.metrics.turnover * 100)}%
                </span>
                <span
                  className={clsx(
                    "text-right tabular-nums",
                    a.metrics.ir > 0 ? "text-paper" : "text-rust",
                  )}
                >
                  {fmtNum(a.metrics.ir, 2)}
                </span>
                <span className="text-right text-paper tabular-nums">
                  {fmtNum(a.scores.final, 2)}
                </span>
                <span className={a.scores.passed ? "text-paper" : "text-rust"}>
                  {refined ? "REWRITTEN" : a.scores.passed ? "✓ PASSED" : "DROPPED"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="relative z-10 min-h-0 overflow-hidden border-t border-line bg-[#16181f] px-3 py-1.5 pointer-events-none">
        <div className="mb-1 font-formula text-[10px] tracking-[0.14em] text-faint">
          SIGNAL DISTRIBUTION (DECILES)
        </div>
        <div className="pointer-events-auto flex h-[56px] items-end gap-1 md:h-[72px]">
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
                  className="relative z-10 flex h-full min-h-[56px] flex-1 flex-col items-center justify-end gap-1 md:min-h-[72px]"
                  title={`D${i + 1} ${d >= 0 ? "+" : ""}${(d * 10000).toFixed(1)} bps`}
                >
                  <div
                    className={clsx(
                      "w-full rounded-[1px]",
                      cls,
                      pinnedDecile?.i === i && "outline outline-1 outline-paper",
                    )}
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
