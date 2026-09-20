"use client";

import { CATEGORY_LABEL } from "@/lib/alphas/library";
import { FormulaText } from "@/components/FormulaText";
import { clsx, fmtIc, fmtNum, fmtPct } from "@/lib/format";
import type { EvaluatedAlpha, Stage } from "@/lib/types";

function sharpeClass(s: number): string {
  if (s > 0) return "text-signal";
  if (s < 0) return "text-rust";
  return "text-ink";
}

function lossClass(x: number, invert = false): string {
  const v = invert ? -x : x;
  return v < 0 ? "text-rust" : "text-ink";
}

export function ResultsTable({
  rows,
  selectedId,
  onSelect,
  stage,
}: {
  rows: EvaluatedAlpha[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  stage: Stage;
}) {
  return (
    <div className="h-full overflow-auto">
      <table className="w-full min-w-[760px] border-collapse text-left text-[11px]">
        <thead className="sticky top-0 z-10 bg-paper font-formula text-[10px] tracking-wider text-[#6b675e]">
          <tr className="border-b border-[#cfc8ba]">
            <th className="px-2 py-1.5 font-medium">ID</th>
            <th className="px-2 py-1.5 font-medium">CAT</th>
            <th className="px-2 py-1.5 font-medium">SRC</th>
            <th className="px-2 py-1.5 font-medium">EXPRESSION</th>
            <th className="px-2 py-1.5 font-medium text-right">IC</th>
            <th className="px-2 py-1.5 font-medium text-right">IR</th>
            <th className="px-2 py-1.5 font-medium text-right">SHARPE</th>
            <th className="px-2 py-1.5 font-medium text-right">RET</th>
            <th className="px-2 py-1.5 font-medium text-right">MDD</th>
            <th className="px-2 py-1.5 font-medium text-right">θ</th>
            <th className="px-2 py-1.5 font-medium text-right">ρ</th>
            <th className="px-2 py-1.5 font-medium">GATE</th>
          </tr>
        </thead>
        <tbody className="font-formula text-ink">
          {rows.map((a) => {
            const on = a.id === selectedId;
            const gate =
              stage === "propose"
                ? "SEED"
                : a.scores.passed
                  ? "PASS"
                  : "DROP";
            return (
              <tr
                key={a.id}
                onClick={() => onSelect(a.id)}
                className={clsx(
                  "cursor-pointer border-b border-[#e0dbd1] hover:bg-[#efebe3]",
                  on && "bg-[#ded8cc]",
                )}
              >
                <td className="px-2 py-1.5">{a.id}</td>
                <td className="px-2 py-1.5 text-[#5c5346]">{CATEGORY_LABEL[a.category]}</td>
                <td className="px-2 py-1.5 uppercase text-[#7a7368]">{a.source}</td>
                <td className="max-w-[280px] truncate px-2 py-1.5">
                  <FormulaText src={a.expression} surface="paper" />
                </td>
                <td className={clsx("px-2 py-1.5 text-right", lossClass(a.metrics.ic))}>
                  {fmtIc(a.metrics.ic)}
                </td>
                <td className={clsx("px-2 py-1.5 text-right", lossClass(a.metrics.ir))}>
                  {fmtNum(a.metrics.ir, 2)}
                </td>
                <td className={clsx("px-2 py-1.5 text-right tabular-nums", sharpeClass(a.metrics.sharpe))}>
                  {fmtNum(a.metrics.sharpe, 2)}
                </td>
                <td className={clsx("px-2 py-1.5 text-right", lossClass(a.metrics.totalReturn))}>
                  {fmtPct(a.metrics.totalReturn, 1)}
                </td>
                <td className="px-2 py-1.5 text-right text-rust">{fmtPct(a.metrics.maxDrawdown, 1)}</td>
                <td className="px-2 py-1.5 text-right">{fmtNum(a.scores.confidence, 2)}</td>
                <td className="px-2 py-1.5 text-right">{fmtNum(a.scores.risk, 2)}</td>
                <td
                  className={clsx(
                    "px-2 py-1.5",
                    gate === "PASS" && "text-ink",
                    gate === "DROP" && "text-rust",
                    gate === "SEED" && "text-[#6b675e]",
                  )}
                >
                  {gate}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
