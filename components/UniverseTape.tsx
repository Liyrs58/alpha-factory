import { marketPath } from "@/lib/data/universe";
import { clsx, fmtPct } from "@/lib/format";
import type { Universe } from "@/lib/types";

function Spark({ values }: { values: number[] }) {
  const w = 64;
  const h = 18;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const d = values
    .map((v, i) => {
      const x = (i / Math.max(values.length - 1, 1)) * w;
      const y = h - ((v - min) / span) * (h - 2) - 1;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} className="shrink-0">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

export function UniverseTape({ universe }: { universe: Universe }) {
  const last = universe.dates.length - 1;
  const mkt = marketPath(universe);
  const mktChg = mkt[last]! / mkt[0]! - 1;

  return (
    <div className="flex min-h-[44px] items-stretch overflow-x-auto border-t border-line bg-charcoal-2">
      <div className="flex shrink-0 items-center gap-3 border-r border-line px-3">
        <span className="text-[10px] tracking-[0.16em] text-faint">UNIV</span>
        <Spark values={mkt.filter((_, i) => i % 4 === 0)} />
        <span className={clsx("font-formula text-[11px]", mktChg < 0 ? "text-rust" : "text-paper")}>
          EW {fmtPct(mktChg, 1)}
        </span>
      </div>
      {universe.tickers.map((tk) => {
        const series = universe.bars[tk.id]!;
        const closes = series.map((b) => b.close);
        const chg = closes[last]! / closes[0]! - 1;
        const d1 = last > 0 ? closes[last]! / closes[last - 1]! - 1 : 0;
        return (
          <div key={tk.id} className="flex shrink-0 items-center gap-2 border-r border-line px-3">
            <div>
              <div className="font-formula text-[11px] text-paper">{tk.id}</div>
              <div className="text-[10px] text-faint">{tk.sector}</div>
            </div>
            <Spark values={closes.filter((_, i) => i % 5 === 0)} />
            <div className="font-formula text-right text-[10px] leading-4">
              <div>{closes[last]!.toFixed(2)}</div>
              <div className={d1 < 0 ? "text-rust" : "text-mute"}>{fmtPct(d1, 1)}</div>
            </div>
            <div className={clsx("font-formula text-[10px]", chg < 0 ? "text-rust" : "text-mute")}>
              {fmtPct(chg, 0)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
