"use client";

import { useState } from "react";
import type { Book, Regime, Universe } from "@/lib/types";
import { fmtPct } from "@/lib/format";

function regimeFill(r: Regime): string {
  if (r === "bull") return "rgba(232,228,220,0.05)";
  if (r === "bear") return "rgba(184,92,68,0.09)";
  return "rgba(232,228,220,0.02)";
}

export function EquityChart({
  book,
  universe,
}: {
  book: Book;
  universe: Universe;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const w = 760;
  const hNav = 200;
  const hDd = 44;
  const h = hNav + hDd;
  const pad = { l: 46, r: 10, t: 12, b: 8 };

  const n = Math.min(book.equity.length, book.bench.length);
  const eq = book.equity.slice(0, n);
  const bn = book.bench.slice(0, n);
  let minV = Infinity;
  let maxV = -Infinity;
  for (let i = 0; i < n; i++) {
    minV = Math.min(minV, eq[i]!, bn[i]!);
    maxV = Math.max(maxV, eq[i]!, bn[i]!);
  }
  if (!Number.isFinite(minV)) {
    minV = 0.9;
    maxV = 1.1;
  }
  const span = maxV - minV || 0.1;
  minV -= span * 0.08;
  maxV += span * 0.1;
  const iw = w - pad.l - pad.r;
  const ih = hNav - pad.t - pad.b;
  const x = (i: number) => pad.l + (i / Math.max(n - 1, 1)) * iw;
  const y = (v: number) => pad.t + (1 - (v - minV) / (maxV - minV)) * ih;
  const toPoly = (arr: number[]) => arr.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

  const dd: number[] = [];
  let peak = eq[0] ?? 1;
  for (let i = 0; i < n; i++) {
    peak = Math.max(peak, eq[i]!);
    dd.push(eq[i]! / peak - 1);
  }
  const ddMin = Math.min(-0.02, ...dd);
  const yDd = (v: number) => hNav + 4 + (1 - (v - ddMin) / (0 - ddMin || 1)) * (hDd - 12);
  const ddLine = dd.map((v, i) => `${x(i).toFixed(1)},${yDd(v).toFixed(1)}`).join(" ");
  const ddFill = `${x(0)},${yDd(0)} ${ddLine} ${x(n - 1)},${yDd(0)}`;

  const bands: { x: number; width: number; fill: string }[] = [];
  let bi = 0;
  while (bi < n - 1) {
    const r = universe.regimes[Math.min(bi, universe.regimes.length - 1)]!;
    let j = bi + 1;
    while (j < n - 1 && universe.regimes[Math.min(j, universe.regimes.length - 1)] === r) j++;
    bands.push({ x: x(bi), width: x(j) - x(bi), fill: regimeFill(r) });
    bi = j;
  }

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((p) => {
    const v = minV + (maxV - minV) * p;
    return { v, y: y(v) };
  });

  const geom = { n, eq, bn, dd, toPoly, x, ddLine, ddFill, bands, yTicks };

  const hi = hover !== null ? Math.max(0, Math.min(geom.n - 1, hover)) : null;

  return (
    <div
      className="relative h-full min-h-[248px] w-full"
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const px = ((e.clientX - rect.left) / rect.width) * w;
        const t = Math.round(((px - pad.l) / (w - pad.l - pad.r)) * (geom.n - 1));
        setHover(t);
      }}
      onMouseLeave={() => setHover(null)}
    >
      <svg viewBox={`0 0 ${w} ${h}`} className="h-full w-full">
        {geom.bands.map((b, i) => (
          <rect key={i} x={b.x} y={pad.t} width={Math.max(0, b.width)} height={hNav - pad.t - pad.b} fill={b.fill} />
        ))}
        {geom.yTicks.map((t, i) => (
          <g key={i}>
            <line x1={pad.l} x2={w - pad.r} y1={t.y} y2={t.y} stroke="#2c303a" />
            <text
              x={pad.l - 6}
              y={t.y + 3}
              textAnchor="end"
              fill="#8b8680"
              fontSize="9"
              fontFamily="var(--font-formula)"
            >
              {t.v.toFixed(2)}
            </text>
          </g>
        ))}
        <polyline points={geom.toPoly(geom.bn)} fill="none" stroke="#8b8680" strokeWidth="1" strokeDasharray="3 3" />
        <polyline points={geom.toPoly(geom.eq)} fill="none" stroke="#e8e4dc" strokeWidth="1.7" />
        <polygon points={geom.ddFill} fill="rgba(184,92,68,0.35)" />
        <polyline points={geom.ddLine} fill="none" stroke="#b85c44" strokeWidth="1" />
        <text x={pad.l} y={hNav + 10} fill="#8b8680" fontSize="8" fontFamily="var(--font-formula)">
          DD
        </text>
        {hi !== null && (
          <line
            x1={geom.x(hi)}
            x2={geom.x(hi)}
            y1={pad.t}
            y2={h - 4}
            stroke="#e8e4dc"
            strokeOpacity="0.35"
          />
        )}
      </svg>
      <div className="pointer-events-none absolute top-1 left-12 flex gap-3 font-formula text-[10px] text-mute">
        <span className="text-paper">━ book</span>
        <span>- - ew bench</span>
        <span className="text-rust">dd</span>
      </div>
      {hi !== null && geom.eq[hi] !== undefined && (
        <div className="pointer-events-none absolute top-1 right-3 font-formula text-[11px] leading-4 text-paper">
          <div>{universe.dates[Math.min(hi, universe.dates.length - 1)]}</div>
          <div>
            {fmtPct(geom.eq[hi]! - 1, 1)}
            <span className="text-mute"> · bench {fmtPct((geom.bn[hi] ?? 1) - 1, 1)}</span>
            <span className="text-rust"> · {fmtPct(geom.dd[hi] ?? 0, 1)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
