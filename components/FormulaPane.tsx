"use client";

import { useMemo } from "react";
import { AstTree } from "@/components/AstTree";
import { FormulaText } from "@/components/FormulaText";
import { parse, pretty, ParseError } from "@/lib/alphas/parser";
import { clsx } from "@/lib/format";

export function FormulaPane({
  value,
  onChange,
  onEval,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  onEval: () => void;
  error: string | null;
}) {
  const ast = useMemo(() => {
    try {
      return parse(value);
    } catch {
      return null;
    }
  }, [value]);

  const sexp = ast ? pretty(ast) : null;

  return (
    <section className="flex h-full min-h-0 max-h-[42vh] flex-col border-r border-line bg-charcoal lg:max-h-none">
      <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
        <span className="text-[10px] font-medium tracking-[0.16em] text-mute">EXPR</span>
        <button
          type="button"
          onClick={onEval}
          className="font-formula text-[10px] tracking-wide text-paper hover:text-amber"
        >
          ⌃↵ EVAL
        </button>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            onEval();
          }
        }}
        className="min-h-[92px] resize-none border-b border-line bg-charcoal-2 px-3 py-2 font-formula text-[12px] leading-5 text-paper outline-none"
        aria-label="Alpha expression"
      />
      <div className="border-b border-line px-3 py-2">
        <div className="mb-1 text-[10px] tracking-[0.14em] text-faint">HIGHLIGHT</div>
        <div className="max-h-16 overflow-auto text-[12px] leading-5">
          <FormulaText src={value} />
        </div>
        {error && <p className="mt-1 font-formula text-[10px] text-rust">{error}</p>}
        {sexp && (
          <p className="mt-2 font-formula text-[10px] leading-4 text-mute">{sexp}</p>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col bg-paper text-ink">
        <div className="border-b border-[#cfc8ba] px-3 py-1 text-[10px] tracking-[0.14em] text-[#6b675e]">
          AST
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <AstTree ast={ast} />
        </div>
        {ast === null && value.trim() && (
          <p className="px-3 pb-2 font-formula text-[10px] text-rust">
            {(() => {
              try {
                parse(value);
                return "";
              } catch (e) {
                return e instanceof ParseError ? e.message : "parse error";
              }
            })()}
          </p>
        )}
      </div>
      <div className={clsx("border-t border-line px-3 py-2 font-formula text-[10px] leading-4 text-faint")}>
        fields: open high low close volume vwap returns rsi atr boll_up boll_down macd
        <br />
        fn: rank delay ts_delta sma std ts_rank ts_max correlation signedpower …
      </div>
    </section>
  );
}
