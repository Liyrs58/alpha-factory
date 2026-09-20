"use client";

import { clsx } from "@/lib/format";
import type { AgentEvent } from "@/lib/types";

const META: Record<
  AgentEvent["agent"],
  { code: string; title: string }
> = {
  proposer: { code: "PR", title: "Proposer" },
  critic: { code: "CR", title: "Critic  CSA+RPA" },
  backtester: { code: "BT", title: "Backtester" },
  pm: { code: "PM", title: "Portfolio Mgr" },
};

const ORDER: AgentEvent["agent"][] = ["proposer", "critic", "backtester", "pm"];

export function AgentRail({
  events,
  revealed,
}: {
  events: AgentEvent[];
  revealed: number;
}) {
  const vis = events.slice(0, revealed);
  return (
    <aside className="flex h-full min-h-0 max-h-[40vh] flex-col border-l-0 border-t border-line bg-charcoal-2 lg:max-h-none lg:border-t-0 lg:border-l">
      <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
        <span className="text-[10px] font-medium tracking-[0.16em] text-mute">AGENTS</span>
        <span className="font-formula text-[10px] text-faint">
          {Math.min(revealed, events.length)}/{events.length}
        </span>
      </div>
      <div className="grid min-h-0 flex-1 grid-rows-4">
        {ORDER.map((agent) => {
          const notes = vis.filter((e) => e.agent === agent);
          const last = notes[notes.length - 1];
          return (
            <section key={agent} className="flex min-h-0 flex-col border-b border-line last:border-b-0">
              <header className="flex items-center gap-2 px-3 py-1">
                <span className="font-formula text-[10px] text-paper">{META[agent].code}</span>
                <span className="text-[11px] text-mute">{META[agent].title}</span>
                <span
                  className={clsx(
                    "ml-auto h-[6px] w-[6px]",
                    notes.length === 0 && "bg-line",
                    last?.tone === "pass" && "bg-paper",
                    last?.tone === "fail" && "bg-rust",
                    last?.tone === "info" && "bg-amber",
                    notes.length > 0 && !last?.tone && "bg-paper",
                  )}
                />
              </header>
              <div className="min-h-0 flex-1 overflow-auto px-3 pb-2">
                {notes.length === 0 ? (
                  <p className="font-formula text-[10px] text-faint">idle</p>
                ) : (
                  notes.map((n, i) => (
                    <pre
                      key={i}
                      className={clsx(
                        "mb-2 whitespace-pre-wrap font-formula text-[10px] leading-[14px]",
                        n.tone === "fail" ? "text-rust" : "text-paper-2",
                      )}
                    >
                      <span className="text-faint">{n.t}  </span>
                      {n.body}
                    </pre>
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </aside>
  );
}
