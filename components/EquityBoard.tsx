"use client";

import { useMemo, useRef, useState } from "react";
import { clsx, fmtNum, fmtPct } from "@/lib/format";
import type { AlphaMetrics } from "@/lib/types";

const RANGES = ["1Y", "3Y", "5Y", "10Y", "ALL"] as const;
type Range = (typeof RANGES)[number];
const BARS: Record<Range, number> = { "1Y": 252, "3Y": 756, "5Y": 1260, "10Y": 2520, ALL: 1e9 };

export function EquityBoard({
  equity,
  dates,
  metrics,
  label,
  onNotice,
}: {
  equity: number[];
  dates: string[];
  metrics: AlphaMetrics;
  label: string;
  onNotice?: (msg: string) => void;
}) {
  const [range, setRange] = useState<Range>("ALL");
  const [hover, setHover] = useState<number | null>(null);

  const w = 640;
  const h = 220;
  const pad = { l: 36, r: 8, t: 12, b: 24 };

  const sliced = useMemo(() => {
    const keep = BARS[range];
    const n = Math.min(equity.length, dates.length);
    const start = Math.max(0, n - keep);
    return {
      eq: equity.slice(start, n),
      dt: dates.slice(start, n),
    };
  }, [dates, equity, range]);

  const n = sliced.eq.length;
  let minV = Math.min(...sliced.eq, 0.85);
  let maxV = Math.max(...sliced.eq, 1.15);
  const span = maxV - minV || 0.1;
  minV -= span * 0.08;
  maxV += span * 0.12;
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  const x = (i: number) => pad.l + (i / Math.max(n - 1, 1)) * iw;
  const y = (v: number) => pad.t + (1 - (v - minV) / (maxV - minV)) * ih;
  const line = sliced.eq.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const fill = `${x(0)},${y(minV)} ${line} ${x(Math.max(n - 1, 0))},${y(minV)}`;
  const yTicks = [0, 0.33, 0.66, 1].map((p) => ({
    v: minV + (maxV - minV) * (1 - p),
    y: pad.t + p * ih,
  }));

  const years: { x: number; label: string }[] = [];
  let lastY = "";
  sliced.dt.forEach((d, i) => {
    const yr = d.slice(0, 4);
    if (yr !== lastY) {
      years.push({ x: x(i), label: yr });
      lastY = yr;
    }
  });

  const hi = hover !== null ? Math.max(0, Math.min(n - 1, hover)) : null;
  const cagr = metrics.totalReturn;
  const yearsN = Math.max((n - 1) / 252, 1e-9);
  const ann = Math.pow(1 + (sliced.eq[n - 1]! / sliced.eq[0]! - 1 || 0), 1 / yearsN) - 1;
  const clamped = range !== "ALL" && BARS[range] > dates.length;

  const svgRef = useRef<SVGSVGElement>(null);

  const setWindow = (r: Range) => {
    setRange(r);
    onNotice?.(`window ${r}${r !== "ALL" && BARS[r] > dates.length ? " · clamped to sample" : ""}`);
  };

  const exportPng = () => {
    const svg = svgRef.current;
    if (!svg) {
      onNotice?.("export failed · no chart");
      return;
    }
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("width", "1280");
    clone.setAttribute("height", "440");
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const xml = new XMLSerializer().serializeToString(clone);
    const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 440;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        onNotice?.("export failed · canvas");
        return;
      }
      ctx.fillStyle = "#16181f";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      try {
        const href = canvas.toDataURL("image/png");
        const a = document.createElement("a");
        a.href = href;
        a.download = "alpha-factory-equity.png";
        a.click();
        onNotice?.("exported alpha-factory-equity.png");
      } catch {
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = "alpha-factory-equity.svg";
        a.click();
        onNotice?.("exported alpha-factory-equity.svg");
      }
    };
    img.onerror = () => {
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = "alpha-factory-equity.svg";
      a.click();
      onNotice?.("exported alpha-factory-equity.svg");
    };
    img.src = dataUrl;
  };

  return (
    <section className="relative z-0 flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[4px] border border-line bg-[#16181f]">
      <header
        data-equity-header
        className="relative z-30 flex shrink-0 flex-wrap items-center gap-1 border-b border-line bg-[#16181f] px-2 py-1.5 font-formula text-[10px] tracking-wide text-mute"
      >
        <span className="mr-2 text-paper">
          EQUITY CURVE • {range}
          <span className="ml-2 text-faint">
            {sliced.dt[0] ?? "—"} → {sliced.dt[sliced.dt.length - 1] ?? "—"} · {n} bars
            {clamped ? " · clamped to sample" : ""}
          </span>
        </span>
        <div className="relative z-30 ml-auto flex shrink-0 items-center gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              aria-label={`Chart window ${r}`}
              aria-pressed={range === r}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setWindow(r);
              }}
              className={clsx(
                "relative z-30 min-h-8 min-w-8 pointer-events-auto px-2 py-1 font-formula text-[10px] tracking-wide",
                range === r ? "bg-paper text-ink" : "text-mute hover:text-paper",
              )}
            >
              {r}
            </button>
          ))}
          <button
            type="button"
            aria-label="Export equity PNG"
            onClick={exportPng}
            className="relative z-30 ml-1 border border-line px-2 py-1 font-formula text-[10px] text-mute hover:text-paper"
          >
            EXPORT PNG
          </button>
        </div>
      </header>
      <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,1fr)_148px]">
        <div
          className="relative z-0 isolate min-h-[200px] min-w-0 overflow-hidden"
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const px = ((e.clientX - rect.left) / rect.width) * w;
            setHover(Math.round(((px - pad.l) / iw) * (n - 1)));
          }}
          onMouseLeave={() => setHover(null)}
        >
          <svg
            ref={svgRef}
            data-equity-svg
            viewBox={`0 0 ${w} ${h}`}
            className="pointer-events-none absolute inset-0 h-full w-full"
            style={{ pointerEvents: "none" }}
            preserveAspectRatio="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect width={w} height={h} fill="#16181f" />
            {yTicks.map((t, i) => (
              <g key={i}>
                <line x1={pad.l} x2={w - pad.r} y1={t.y} y2={t.y} stroke="#2c303a" />
                <text
                  x={pad.l - 6}
                  y={t.y + 3}
                  textAnchor="end"
                  fill="#8b8680"
                  fontSize="9"
                  fontFamily="ui-monospace, monospace"
                >
                  {t.v.toFixed(1)}
                </text>
              </g>
            ))}
            <polygon points={fill} fill="rgba(61,255,154,0.08)" />
            <polyline points={line} fill="none" stroke="#3DFF9A" strokeWidth="1.8" />
            {hi !== null && (
              <line x1={x(hi)} x2={x(hi)} y1={pad.t} y2={h - pad.b} stroke="#e8e4dc" strokeOpacity="0.25" />
            )}
            {years.map((yr, i) => (
              <text
                key={i}
                x={yr.x}
                y={h - 8}
                fill="#8b8680"
                fontSize="9"
                fontFamily="ui-monospace, monospace"
              >
                {yr.label}
              </text>
            ))}
          </svg>
          <div className="pointer-events-none absolute bottom-7 left-10 z-0 font-formula text-[10px] text-mute">
            {label}
            {metrics.sharpe > 0 ? (
              <span className="text-signal"> (Sharpe {fmtNum(metrics.sharpe, 2)})</span>
            ) : (
              <span className="text-rust"> (Sharpe {fmtNum(metrics.sharpe, 2)})</span>
            )}
          </div>
          {hi !== null && sliced.eq[hi] !== undefined && (
            <div className="pointer-events-none absolute top-2 right-3 z-0 font-formula text-[11px] text-paper">
              {sliced.dt[hi]} {fmtPct(sliced.eq[hi]! / sliced.eq[0]! - 1, 1)}
            </div>
          )}
        </div>
        <dl className="relative z-10 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-line px-3 py-3 font-formula text-[12px] md:grid-cols-1 md:border-t-0 md:border-l">
          <Stat k="TOTAL RETURN" v={fmtPct(cagr, 1)} pos={cagr} />
          <Stat k="ANNUALIZED" v={fmtPct(ann, 1)} pos={ann} />
          <Stat k="SHARPE" v={fmtNum(metrics.sharpe, 2)} pos={metrics.sharpe} sharpe />
          <Stat k="MAXDD" v={fmtPct(metrics.maxDrawdown, 1)} pos={-1} />
          <Stat k="CALMAR" v={fmtNum(metrics.calmar, 2)} pos={metrics.calmar} />
        </dl>
      </div>
    </section>
  );
}

function Stat({
  k,
  v,
  pos,
  sharpe,
}: {
  k: string;
  v: string;
  pos: number;
  sharpe?: boolean;
}) {
  const cls =
    k === "MAXDD" || pos < 0
      ? "text-rust"
      : sharpe || pos > 0
        ? "text-signal"
        : "text-paper";
  return (
    <div>
      <dt className="text-[9px] tracking-[0.14em] text-faint">{k}</dt>
      <dd className={clsx("tabular-nums", cls)}>{v}</dd>
    </div>
  );
}
