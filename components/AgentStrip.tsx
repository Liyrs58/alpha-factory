"use client";

import { clsx } from "@/lib/format";
import type { AgentCard } from "@/lib/agents/copy";

export function AgentStrip({
  cards,
  onRefine,
  busy,
  active,
  onSelect,
}: {
  cards: AgentCard[];
  onRefine: () => void;
  busy: boolean;
  active: AgentCard["agent"] | null;
  onSelect: (agent: AgentCard["agent"]) => void;
}) {
  return (
    <section className="rounded-[4px] bg-paper px-3 py-2 text-ink">
      <div className="mb-2 text-[10px] font-medium tracking-[0.16em] text-[#6b675e]">
        AGENT NOTES
        <span className="ml-2 font-normal tracking-normal text-[#9a9488]">click a card</span>
      </div>
      <div className="flex flex-col gap-2 lg:flex-row lg:items-stretch">
        <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((c) => (
            <button
              key={c.agent}
              type="button"
              aria-label={`${c.title} agent`}
              aria-pressed={active === c.agent}
              onClick={() => onSelect(c.agent)}
              className={clsx(
                "rounded-[3px] border bg-[#efebe3] px-2.5 py-2 text-left",
                active === c.agent ? "border-ink" : "border-[#d4cfc4] hover:border-[#b8b2a6]",
              )}
            >
              <header className="mb-1 font-formula text-[10px] tracking-wide text-[#6b675e]">
                {c.title}
                <span className="text-[#9a9488]"> • {c.latency}</span>
              </header>
              <p className="text-[11px] leading-[15px] text-[#2c2a26]">{c.body}</p>
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-label="Refine factory"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRefine();
          }}
          className="relative z-40 shrink-0 self-end border border-ink bg-ink px-3 py-2 font-formula text-[11px] tracking-wide text-paper hover:bg-charcoal lg:self-center"
        >
          {busy ? "REFINING…" : "REFINE (R)"}
        </button>
      </div>
    </section>
  );
}
