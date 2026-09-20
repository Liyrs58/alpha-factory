"use client";

import { useMemo } from "react";
import { FormulaText } from "@/components/FormulaText";
import { parse, pretty, ParseError } from "@/lib/alphas/parser";

export function FormulaEditor({
  value,
  onChange,
  onEval,
  onFormat,
  onUndo,
  onClear,
  onStop,
  onSave,
  onToggleSettings,
  error,
  settingsOpen,
  neutralized,
  delay,
  onToggleNeutralized,
  onCycleDelay,
  universeLabel = "DEMO10",
  onPickCsv,
  onResetUniverse,
}: {
  value: string;
  onChange: (v: string) => void;
  onEval: () => void;
  onFormat: () => void;
  onUndo: () => void;
  onClear: () => void;
  onStop: () => void;
  onSave: () => void;
  onToggleSettings: () => void;
  error: string | null;
  settingsOpen: boolean;
  neutralized: boolean;
  delay: number;
  onToggleNeutralized: () => void;
  onCycleDelay: () => void;
  universeLabel?: string;
  onPickCsv?: (text: string, name: string) => void;
  onResetUniverse?: () => void;
}) {
  const parsed = useMemo(() => {
    try {
      return { ast: parse(value), err: null as string | null };
    } catch (e) {
      return {
        ast: null,
        err: e instanceof ParseError ? e.message : "parse error",
      };
    }
  }, [value]);

  const valid = parsed.ast !== null && value.trim().length > 0;
  const lines = Math.max(4, value.split("\n").length);

  return (
    <section className="overflow-hidden rounded-[4px] bg-paper text-ink">
      <div className="flex items-center gap-2 border-b border-[#d4cfc4] px-3 py-1.5">
        <span className="h-[7px] w-[7px] rounded-full bg-[#2A6A42]" />
        <span className="text-[11px] font-medium tracking-wide text-[#3a3832]">
          ALPHA EXPRESSION [1]
        </span>
        <div className="ml-auto flex items-center gap-1 text-[#6b675e]">
          <IconBtn label="Run expression" onClick={onEval}>
            <PlayIcon />
          </IconBtn>
          <IconBtn label="Stop run" onClick={onStop}>
            <StopIcon />
          </IconBtn>
          <IconBtn label="Save snapshot" onClick={onSave}>
            <SaveIcon />
          </IconBtn>
          <IconBtn label="Settings" onClick={onToggleSettings}>
            <GearIcon />
          </IconBtn>
        </div>
      </div>

      <div className="relative flex min-h-[88px] font-formula text-[13px] leading-[22px]">
        <div className="select-none border-r border-[#d4cfc4] px-2 py-2 text-right text-[11px] text-[#9a9488]">
          {Array.from({ length: lines }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <div className="relative min-h-[88px] flex-1">
          <pre className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-all px-3 py-2">
            <FormulaText src={value || " "} surface="paper" />
          </pre>
          <textarea
            id="alpha-expr"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            spellCheck={false}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                onEval();
              }
            }}
            aria-label="Alpha expression"
            className="relative z-10 h-full min-h-[88px] w-full resize-none bg-transparent px-3 py-2 text-transparent caret-[#1a1d18] outline-none"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[#d4cfc4] px-3 py-1.5 font-formula text-[10px] tracking-wide text-[#6b675e]">
        <span className={valid ? "text-[#2A6A42]" : "text-rust"}>
          {valid ? "VALID EXPRESSION" : error || parsed.err || "EMPTY"}
        </span>
        <span>SIGNAL RANGE: [-1.00, 1.00]</span>
        <button
          type="button"
          aria-label="Toggle neutralized"
          aria-pressed={neutralized}
          className="hover:text-ink"
          onClick={onToggleNeutralized}
        >
          NEUTRALIZED: {neutralized ? "yes" : "no"}
        </button>
        <button type="button" aria-label="Cycle delay window" className="hover:text-ink" onClick={onCycleDelay}>
          DELAY: {delay}
        </button>
        <div className="ml-auto flex gap-3">
          <button type="button" aria-label="Format expression" className="hover:text-ink" onClick={onFormat}>
            FORMAT
          </button>
          <button type="button" aria-label="Undo expression" className="hover:text-ink" onClick={onUndo}>
            UNDO
          </button>
          <button type="button" aria-label="Clear expression" className="hover:text-ink" onClick={onClear}>
            CLEAR
          </button>
        </div>
      </div>
      {settingsOpen && (
        <div className="border-t border-[#d4cfc4] bg-[#efebe3] px-3 py-2 font-formula text-[11px] leading-5 text-[#3a3832]">
          Settings · neutralize wraps the next eval in <span className="text-[#2A6A42]">zscore(…)</span>
          · delay rewrites <span className="text-[#2A6A42]">delay / ts_delta</span> windows.
          Play evals the editor on the active universe ({universeLabel}). Stop cancels an in-flight factory run.
          <span className="mt-1 block text-[#6b675e]">
            LLM: NVIDIA NIM <span className="text-[#2A6A42]">google/gemma-4-31b-it</span> when
            <span className="text-[#2A6A42]"> NVIDIA_API_KEY</span> is set, else mock.
            LIVE_TRADING=false (paper broker not wired).
          </span>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <label className="cursor-pointer hover:text-ink">
              UPLOAD OHLCV
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                aria-label="Upload OHLCV CSV"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file || !onPickCsv) return;
                  void file.text().then((text) => onPickCsv(text, file.name));
                }}
              />
            </label>
            <button
              type="button"
              aria-label="Reset DEMO10 universe"
              className="hover:text-ink"
              onClick={onResetUniverse}
            >
              RESET DEMO10
            </button>
            <span className="text-[#9a9488]">
              CSV header: date,ticker,open,high,low,close,volume[,vwap]
            </span>
          </div>
        </div>
      )}
      {parsed.ast && (
        <div className="border-t border-[#d4cfc4] px-3 py-1 font-formula text-[10px] text-[#7a7368]">
          {pretty(parsed.ast)}
        </div>
      )}
    </section>
  );
}

function IconBtn({
  children,
  onClick,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid h-6 w-6 place-items-center hover:text-ink"
    >
      {children}
    </button>
  );
}

function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
      <path d="M3 2.2v7.6L10 6 3 2.2z" />
    </svg>
  );
}
function StopIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
      <rect x="2.5" y="2.5" width="7" height="7" />
    </svg>
  );
}
function SaveIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
      <rect x="2" y="2" width="8" height="8" />
      <path d="M4 2v3h4V2" />
    </svg>
  );
}
function GearIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
      <circle cx="6" cy="6" r="2" />
      <path d="M6 1.5v1.4M6 9.1v1.4M1.5 6h1.4M9.1 6h1.4M2.8 2.8l1 1M8.2 8.2l1 1M2.8 9.2l1-1M8.2 3.8l1-1" />
    </svg>
  );
}
