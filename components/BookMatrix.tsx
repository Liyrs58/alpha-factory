"use client";

import { CATEGORY_LABEL } from "@/lib/alphas/library";
import { FormulaText } from "@/components/FormulaText";
import { clsx, fmtNum } from "@/lib/format";
import type { Book, Regime } from "@/lib/types";

const ORDER: Regime[] = ["bull", "bear", "sideways"];

export function BookMatrix({ book }: { book: Book }) {
  const k = book.selected.length;
  const absMax = Math.max(
    0.01,
    ...ORDER.flatMap((r) => book.weights[r].map((w) => Math.abs(w))),
  );

  return (
    <div className="h-full overflow-auto p-3">
      <div className="mb-3 font-formula text-[10px] tracking-wider text-[#6b675e]">
        SELECTED BOOK · REGIME-ADAPTIVE WEIGHTS · ridge+IC blend · λ=0.8
      </div>
      <table className="w-full border-collapse text-left text-[11px]">
        <thead className="font-formula text-[10px] tracking-wider text-[#6b675e]">
          <tr className="border-b border-[#cfc8ba]">
            <th className="px-2 py-1.5 font-medium">ID</th>
            <th className="px-2 py-1.5 font-medium">CAT</th>
            <th className="px-2 py-1.5 font-medium">EXPRESSION</th>
            <th className="px-2 py-1.5 font-medium">SGN</th>
            {ORDER.map((r) => (
              <th key={r} className="px-2 py-1.5 font-medium uppercase">
                {r === "sideways" ? "SIDE" : r}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="font-formula text-ink">
          {book.selected.map((a, i) => (
            <tr key={a.id} className="border-b border-[#e0dbd1]">
              <td className="px-2 py-2">{a.id}</td>
              <td className="px-2 py-2 text-[#5c5346]">{CATEGORY_LABEL[a.category]}</td>
              <td className="max-w-[340px] truncate px-2 py-2">
                <FormulaText src={a.expression} surface="paper" />
              </td>
              <td className={clsx("px-2 py-2", a.metrics.ic < 0 && "text-rust")}>
                {a.metrics.ic < 0 ? "−" : "+"}
              </td>
              {ORDER.map((r) => {
                const w = book.weights[r][i] ?? 0;
                const width = (Math.abs(w) / absMax) * 72;
                return (
                  <td key={r} className="px-2 py-2">
                    <div className="flex items-center gap-2">
                      <span className="w-10 text-right tabular-nums">{fmtNum(w, 2)}</span>
                      <span className="relative h-[8px] w-[72px] bg-[#d6d0c4]">
                        <span
                          className={clsx(
                            "absolute top-0 left-0 h-[8px]",
                            w < 0 ? "bg-rust" : "bg-ink",
                          )}
                          style={{ width }}
                        />
                      </span>
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-4 max-w-[62ch] text-[12px] leading-5 text-[#4a463f]">
        Composite α<sub>t</sub> = Σ<sub>j</sub> w<sub>j,r(t)</sub> · zscored(α<sub>j,t</sub>).
        Negative IC names are sign-flipped before weighting. Demo stand-in for the paper’s 3-layer
        MLP (|A| → 10 → 1). Daily top-4 equal-weight long, k=4 of {k} signals.
      </p>
    </div>
  );
}
