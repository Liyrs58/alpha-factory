"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgentStrip } from "@/components/AgentStrip";
import { EquityBoard } from "@/components/EquityBoard";
import { FormulaEditor } from "@/components/FormulaEditor";
import { ResultsBoard } from "@/components/ResultsBoard";
import { cardsForAlpha } from "@/lib/agents/copy";
import { criticRewrite, nextRefinedId } from "@/lib/agents/mutate";
import { scratchBacktest } from "@/lib/agents/pipeline";
import { SEED_LIBRARY } from "@/lib/alphas/library";
import { formatSource, setDelayWindows } from "@/lib/alphas/parser";
import { UNIVERSE } from "@/lib/data/universe";
import type { AgentEvent, EvaluatedAlpha, PipelineResult, SeedAlpha } from "@/lib/types";

const DELAYS = [1, 5, 14];
const AS_OF = UNIVERSE.dates[UNIVERSE.dates.length - 1] ?? "";

function factoryNote(next: PipelineResult): string {
  return `factory ${next.evaluated.length} seeds · book ${next.book.selected.map((s) => s.id).join(",")} · Sharpe ${next.book.metrics.sharpe.toFixed(2)}`;
}

function downloadJson(name: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function toSeed(a: EvaluatedAlpha | SeedAlpha): SeedAlpha {
  return {
    id: a.id,
    name: a.name,
    category: a.category,
    expression: a.expression,
    source: a.source,
    rationale: a.rationale,
    parentId: a.parentId,
    generation: a.generation,
    mutation: a.mutation,
  };
}

const SEED_IDS = new Set(SEED_LIBRARY.map((s) => s.id));

/** LLM proposals + critic rewrites currently in the factory (not A01–A24). */
function extrasFrom(result: PipelineResult): SeedAlpha[] {
  return result.evaluated.filter((a) => !SEED_IDS.has(a.id)).map(toSeed);
}

function mergeSeeds(base: SeedAlpha[], incoming: SeedAlpha[]): SeedAlpha[] {
  const map = new Map(base.map((s) => [s.id, s]));
  for (const s of incoming) map.set(s.id, s);
  return [...map.values()];
}

function applyFactory(
  next: PipelineResult,
  setResult: (r: PipelineResult) => void,
  setSelectedId: (id: string) => void,
  setExpr: (s: string) => void,
  setLastRun: (s: string) => void,
  setScratch: (a: EvaluatedAlpha | null) => void,
  note: (s: string) => void,
  preferId?: string,
) {
  setResult(next);
  setScratch(null);
  const hero =
    next.evaluated.find((a) => a.id === preferId) ??
    next.evaluated.find((a) => a.id === "A19") ??
    next.book.selected[0] ??
    next.evaluated[0];
  if (hero) {
    setSelectedId(hero.id);
    setExpr(hero.expression);
  }
  setLastRun(`${AS_OF} 09:14:32`);
  note(factoryNote(next));
}

export default function LabApp({ initial }: { initial: PipelineResult }) {
  const [result, setResult] = useState<PipelineResult>(initial);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState("A19");
  const [expr, setExpr] = useState("rank(ts_delta(close, 5)) - rank(volume)");
  const [undo, setUndo] = useState<string[]>([]);
  const [scratch, setScratch] = useState<EvaluatedAlpha | null>(null);
  const [scratchErr, setScratchErr] = useState<string | null>(null);
  const [llmMsg, setLlmMsg] = useState<string | null>(null);
  const [llmBusy, setLlmBusy] = useState(false);
  const [lastRun, setLastRun] = useState(`${AS_OF} 09:14:32`);
  const [view, setView] = useState<"alpha" | "book">("alpha");
  const [status, setStatus] = useState(() => factoryNote(initial));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [neutralized, setNeutralized] = useState(true);
  const [delay, setDelay] = useState(5);
  const [agent, setAgent] = useState<AgentEvent["agent"]>("proposer");
  const [filter, setFilter] = useState<"all" | "passed" | "dropped">("all");
  const [pinnedDecile, setPinnedDecile] = useState<{ i: number; v: number } | null>(null);
  const [proposeIdx, setProposeIdx] = useState(0);
  const [statusFlash, setStatusFlash] = useState(false);
  const flashTimer = useRef<number | null>(null);
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const runGen = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const note = useCallback((msg: string) => setStatus(msg), []);

  const flash = useCallback((msg: string) => {
    setStatus(msg);
    setStatusFlash(true);
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setStatusFlash(false), 2400);
  }, []);

  const compute = useCallback(
    (extras: SeedAlpha[] = [], llmUsed = false, preferId?: string) => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      const gen = ++runGen.current;
      setBusy(true);
      note("running factory…");
      void (async () => {
        try {
          await new Promise<void>((resolve, reject) => {
            const t = window.setTimeout(resolve, 80);
            ac.signal.addEventListener(
              "abort",
              () => {
                window.clearTimeout(t);
                reject(new DOMException("stopped", "AbortError"));
              },
              { once: true },
            );
          });
          const res = await fetch("/api/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ alphas: extras, llmUsed }),
            signal: ac.signal,
          });
          if (!res.ok) throw new Error(`factory HTTP ${res.status}`);
          const next = (await res.json()) as PipelineResult;
          if (gen !== runGen.current) return;
          setBusy(false);
          applyFactory(next, setResult, setSelectedId, setExpr, setLastRun, setScratch, note, preferId);
        } catch (e) {
          if (ac.signal.aborted || (e instanceof DOMException && e.name === "AbortError")) {
            if (gen === runGen.current) {
              setBusy(false);
              note("stopped");
            }
            return;
          }
          try {
            const { runPipeline } = await import("@/lib/agents/pipeline");
            if (gen !== runGen.current) return;
            const next = runPipeline(UNIVERSE, extras, llmUsed);
            if (gen !== runGen.current) return;
            setBusy(false);
            applyFactory(next, setResult, setSelectedId, setExpr, setLastRun, setScratch, note, preferId);
          } catch (inner) {
            if (gen !== runGen.current) return;
            setBusy(false);
            note(inner instanceof Error ? inner.message : "factory failed");
          }
        }
      })();
    },
    [note],
  );

  const rows = useMemo(() => {
    if (!result) return [];
    const list = [...result.evaluated].sort((a, b) => {
      const ag = a.generation ?? 0;
      const bg = b.generation ?? 0;
      if (ag !== bg) return bg - ag;
      return b.scores.final - a.scores.final;
    });
    if (scratch) return [scratch, ...list.filter((a) => a.id !== "SCR")];
    return list;
  }, [result, scratch]);

  const selected = rows.find((a) => a.id === selectedId) ?? rows[0] ?? null;
  const inBook = Boolean(result && selected && result.book.selected.some((s) => s.id === selected.id));
  const cards = selected ? cardsForAlpha(selected, inBook) : [];

  const pushExpr = (next: string) => {
    setUndo((u) => [...u.slice(-24), expr]);
    setExpr(next);
  };

  const onSelect = (id: string) => {
    setSelectedId(id);
    const a = rows.find((x) => x.id === id);
    if (a) {
      setUndo((u) => [...u.slice(-24), expr]);
      setExpr(a.expression);
      note(`loaded ALP-${a.id}`);
    }
    setView("alpha");
  };

  const onEval = () => {
    try {
      const src = neutralized ? `zscore((${expr}))` : expr;
      const a = scratchBacktest(UNIVERSE, src);
      a.expression = expr;
      setScratch(a);
      setSelectedId(a.id);
      setScratchErr(null);
      setView("alpha");
      note(`eval Sharpe ${a.metrics.sharpe.toFixed(2)} · IC ${a.metrics.ic.toFixed(3)}`);
    } catch (e) {
      setScratchErr(e instanceof Error ? e.message : "eval failed");
      note(e instanceof Error ? e.message : "eval failed");
    }
  };

  const onStop = () => {
    runGen.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    note(busy ? "stopped" : "nothing running");
  };

  const onSave = () => {
    downloadJson("alpha-factory-session.json", {
      asOf: UNIVERSE.dates[UNIVERSE.dates.length - 1],
      expression: expr,
      neutralized,
      delay,
      selected: selected
        ? { id: selected.id, metrics: selected.metrics, scores: selected.scores }
        : null,
      book: result?.book.selected.map((s) => ({ id: s.id, expression: s.expression })) ?? [],
      weights: result?.book.weights ?? null,
    });
    note("saved alpha-factory-session.json");
  };

  const onFormat = () => {
    try {
      const next = formatSource(expr);
      pushExpr(next);
      note("formatted");
    } catch (e) {
      note(e instanceof Error ? e.message : "format failed");
    }
  };

  const onCycleDelay = () => {
    const next = DELAYS[(DELAYS.indexOf(delay) + 1) % DELAYS.length]!;
    setDelay(next);
    try {
      pushExpr(setDelayWindows(expr, next));
      note(`delay → ${next}`);
    } catch {
      note(`delay ${next} (expression unchanged)`);
    }
  };

  const proposeLlm = async () => {
    setLlmBusy(true);
    note("proposer · requesting formulas…");
    try {
      const res = await fetch("/api/propose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offset: proposeIdx }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        demo?: boolean;
        alphas: SeedAlpha[];
        message?: string;
      };
      setProposeIdx((i) => i + 4);
      if (!json.ok || json.alphas.length === 0) {
        setLlmMsg("propose failed");
        note("propose failed");
        return;
      }
      setLlmMsg(json.message ?? `+${json.alphas.length} formulas`);
      const extras = mergeSeeds(extrasFrom(result), json.alphas);
      compute(extras, !json.demo, json.alphas[0]?.id);
    } catch {
      setLlmMsg("propose offline");
      note("propose offline");
    } finally {
      setLlmBusy(false);
    }
  };

  const onRefine = useCallback(() => {
    if (!selected) {
      note("refine empty · select a row");
      return;
    }
    const parent = toSeed(selected);
    const generation = parent.generation ?? 0;
    const taken = result.evaluated.map((a) => a.expression);
    const mut = criticRewrite(parent.expression, generation, taken);
    const id = nextRefinedId(
      parent.id,
      result.evaluated.map((a) => a.id),
    );

    let local: EvaluatedAlpha;
    try {
      local = scratchBacktest(UNIVERSE, mut.expression);
    } catch (e) {
      note(e instanceof Error ? e.message : "refine failed");
      return;
    }
    local.id = id;
    local.name = `${parent.name} · ${mut.label}`;
    local.category = parent.category;
    local.source = parent.source;
    local.rationale = mut.note;
    local.parentId = parent.id;
    local.generation = generation + 1;
    local.mutation = mut.label;
    local.expression = mut.expression;

    const optimistic: PipelineResult = {
      ...result,
      evaluated: [local, ...result.evaluated.filter((x) => x.id !== id)],
      proposed: [...result.proposed.filter((p) => p.id !== id), toSeed(local)],
    };
    setResult(optimistic);
    setScratch(null);
    setSelectedId(id);
    setExpr(mut.expression);
    setAgent("critic");
    setFilter("all");
    setView("alpha");
    setBusy(false);
    flash(
      `refine ${parent.id} → ${id} · ${mut.label} · Sharpe ${local.metrics.sharpe.toFixed(2)} · ${parent.expression} ⇒ ${mut.expression}`,
    );
    requestAnimationFrame(() => {
      document.querySelector(`[data-alpha-id="${id}"]`)?.scrollIntoView({ block: "nearest" });
    });

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const gen = ++runGen.current;
    const pool = result.evaluated.map(toSeed);
    void (async () => {
      try {
        const res = await fetch("/api/refine", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parent, pool, generation }),
          signal: ac.signal,
        });
        if (!res.ok) return;
        const json = (await res.json()) as {
          ok: boolean;
          child: SeedAlpha;
          result: PipelineResult;
        };
        if (gen !== runGen.current || !json.ok) return;
        setResult(json.result);
        const stillOnChild = selectedIdRef.current === id || selectedIdRef.current === json.child.id;
        if (stillOnChild) {
          setSelectedId(json.child.id);
          setExpr(json.child.expression);
        }
      } catch {
        /* local rewrite already visible */
      }
    })();
  }, [flash, note, result, selected]);

  const onAgent = (who: AgentEvent["agent"]) => {
    setAgent(who);
    if (who === "proposer") {
      document.getElementById("alpha-expr")?.focus();
      note("proposer · editor focused");
    } else if (who === "critic") {
      setFilter((f) => (f === "all" ? "passed" : f === "passed" ? "dropped" : "all"));
      note("critic · cycle PASS / DROP / ALL");
    } else if (who === "backtester") {
      setView("alpha");
      note("backtester · alpha equity");
    } else {
      setView("book");
      note("pm · book equity + regime weights");
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const inField = tag === "TEXTAREA" || tag === "INPUT";
      if (e.key === "F5") {
        e.preventDefault();
        setBusy(true);
        compute(extrasFrom(result), result.llmUsed);
      }
      if (e.key === "F9") {
        e.preventDefault();
        onSave();
      }
      if (inField) return;
      if (e.key === "r") {
        e.preventDefault();
        onRefine();
      }
      if (e.key === "j" || e.key === "k") {
        const idx = rows.findIndex((a) => a.id === selectedId);
        const next = e.key === "j" ? idx + 1 : idx - 1;
        const row = rows[Math.max(0, Math.min(rows.length - 1, next))];
        if (row) onSelect(row.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, selectedId, compute, expr, selected, result, onRefine]);

  const period = `${UNIVERSE.dates[0]} – ${UNIVERSE.dates[UNIVERSE.dates.length - 1]}`;
  const asOf = UNIVERSE.dates[UNIVERSE.dates.length - 1];
  const chartEquity =
    view === "book" && result ? result.book.equity : (selected?.equity ?? [1]);
  const chartMetrics =
    view === "book" && result ? result.book.metrics : selected?.metrics;
  const chartLabel =
    view === "book" ? "BOOK composite" : selected ? `ALP-${selected.id}` : "—";

  return (
    <div className="flex min-h-dvh flex-col bg-charcoal text-paper md:h-dvh md:overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
        <button
          type="button"
          aria-label="Run factory"
          onClick={() => {
            setBusy(true);
            compute(extrasFrom(result), result.llmUsed);
          }}
          className="flex items-center gap-2 font-formula text-[13px] tracking-wide hover:text-signal"
        >
          <span className="text-signal">▸</span>
          ALPHA FACTORY
          <span className="text-[11px] text-mute">v0.1.0</span>
        </button>
        <div className="hidden font-formula text-[11px] text-mute md:block">
          WORKSPACE: quant_research
          <span className="mx-2 text-faint">|</span>
          UNIVERSE: DEMO10
          <span className="mx-2 text-faint">|</span>
          DATE: {asOf}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {llmMsg && (
            <span className="max-w-[200px] truncate font-formula text-[10px] text-amber">{llmMsg}</span>
          )}
          <button
            type="button"
            aria-label="Propose with LLM"
            onClick={proposeLlm}
            disabled={llmBusy}
            className="px-2 py-1 font-formula text-[11px] text-mute hover:text-paper disabled:opacity-40"
          >
            {llmBusy ? "LLM…" : "LLM"}
          </button>
          <button
            type="button"
            aria-label="Run factory"
            onClick={() => {
              setBusy(true);
              compute(extrasFrom(result), result.llmUsed);
            }}
            className="px-2 py-1 font-formula text-[11px] text-paper hover:text-signal"
          >
            F5 RUN
          </button>
          <button
            type="button"
            aria-label="Save session"
            onClick={onSave}
            className="px-2 py-1 font-formula text-[11px] text-mute hover:text-paper"
          >
            F9 SAVE
          </button>
          <span className="px-2 py-1 font-formula text-[11px] text-mute">demo</span>
        </div>
      </header>
      <div
        className={`border-b px-3 py-1 font-formula text-[10px] ${statusFlash ? "border-signal bg-signal text-ink" : "border-line text-mute"}`}
        role="status"
      >
        {status}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 px-2 pb-2 pt-2">
        <FormulaEditor
          value={expr}
          onChange={setExpr}
          onEval={onEval}
          onFormat={onFormat}
          onUndo={() => {
            const prev = undo[undo.length - 1];
            if (prev === undefined) {
              note("undo empty");
              return;
            }
            setUndo((u) => u.slice(0, -1));
            setExpr(prev);
            note("undo");
          }}
          onClear={() => {
            pushExpr("");
            note("cleared");
          }}
          onStop={onStop}
          onSave={onSave}
          onToggleSettings={() => {
            setSettingsOpen((s) => !s);
            note(settingsOpen ? "settings closed" : "settings open");
          }}
          error={scratchErr}
          settingsOpen={settingsOpen}
          neutralized={neutralized}
          delay={delay}
          onToggleNeutralized={() => {
            setNeutralized((n) => !n);
            note(`neutralized → ${!neutralized ? "yes" : "no"}`);
          }}
          onCycleDelay={onCycleDelay}
        />

        <AgentStrip
          cards={cards}
          busy={busy}
          active={agent}
          onSelect={onAgent}
          onRefine={onRefine}
        />

        <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_minmax(12rem,1fr)] gap-2 md:grid-cols-2 md:grid-rows-[minmax(0,1fr)]">
          {result && (
            <>
              <ResultsBoard
                rows={rows}
                selectedId={selected?.id ?? null}
                onSelect={onSelect}
                lastRun={lastRun}
                period={period}
                filter={filter}
                onFilter={(f) => {
                  setFilter(f);
                  note(`filter ${f}`);
                }}
                pinnedDecile={pinnedDecile}
                onPinDecile={(i, v) => {
                  setPinnedDecile({ i, v });
                  note(`decile ${i + 1} ${(v * 1e4).toFixed(1)} bps`);
                }}
              />
              {chartMetrics && (
                <div className="relative z-0 flex h-full min-h-0 min-w-0 flex-col gap-1 overflow-hidden">
                  <div className="flex gap-1 px-1">
                    <button
                      type="button"
                      aria-label="Show alpha equity"
                      aria-pressed={view === "alpha"}
                      onClick={() => {
                        setView("alpha");
                        note("equity · alpha");
                      }}
                      className={`px-2 py-0.5 font-formula text-[10px] ${view === "alpha" ? "bg-paper text-ink" : "text-mute"}`}
                    >
                      ALPHA
                    </button>
                    <button
                      type="button"
                      aria-label="Show book equity"
                      aria-pressed={view === "book"}
                      onClick={() => {
                        setView("book");
                        note("equity · book");
                      }}
                      className={`px-2 py-0.5 font-formula text-[10px] ${view === "book" ? "bg-paper text-ink" : "text-mute"}`}
                    >
                      BOOK
                    </button>
                  </div>
                  <EquityBoard
                    equity={chartEquity}
                    dates={UNIVERSE.dates}
                    metrics={chartMetrics}
                    label={chartLabel}
                    onNotice={note}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
