import { treeLines } from "@/lib/alphas/parser";
import type { AstNode } from "@/lib/types";
import { clsx } from "@/lib/format";

export function AstTree({ ast }: { ast: AstNode | null }) {
  if (!ast) {
    return (
      <div className="px-3 py-4 text-[11px] leading-4 text-[#6b675e]">
        Unparseable. Check parens and function names.
      </div>
    );
  }
  const lines = treeLines(ast);
  return (
    <ol className="font-formula px-3 py-2 text-[11px] leading-[18px] text-ink">
      {lines.map((ln, i) => (
        <li key={i} className="flex gap-2">
          <span className="w-4 shrink-0 text-[#9a9488] select-none">
            {ln.depth === 0 ? "▾" : "·"}
          </span>
          <span
            className="truncate"
            style={{ paddingLeft: ln.depth * 12 }}
          >
            <span
              className={clsx(
                ln.kind === "fn" && "text-[#6b4f1d]",
                ln.kind === "field" && "text-ink",
                ln.kind === "num" && "text-[#5c5346]",
                ln.kind === "op" && "text-[#7a3b2e]",
              )}
            >
              {ln.label}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}
