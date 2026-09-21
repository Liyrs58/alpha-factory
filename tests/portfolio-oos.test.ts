import { describe, expect, it } from "vitest";
import { evaluateSeed, runPipeline, walkForwardBacktest } from "@/lib/agents/pipeline";
import { buildPanel } from "@/lib/alphas/eval";
import { SEED_LIBRARY } from "@/lib/alphas/library";
import { UNIVERSE } from "@/lib/data/universe";
import type { Universe } from "@/lib/types";

const baseline = runPipeline(UNIVERSE);

describe("walk-forward portfolio", () => {
  it("keeps alpha selection in training and reports only the final test window", () => {
    const { book, evaluated } = baseline;
    expect(book.trainingEnd < book.testStart).toBe(true);
    expect(book.testStart).toBe(UNIVERSE.dates[Math.floor(UNIVERSE.dates.length * 0.8)]);
    expect(book.evaluationDates[0]).toBe(book.testStart);
    expect(book.equity.length).toBe(book.evaluationDates.length);
    expect(book.bench.length).toBe(book.evaluationDates.length);
    expect(evaluated.every((alpha) => alpha.equity.length <= Math.floor(UNIVERSE.dates.length * 0.6))).toBe(true);
  });

  it("deducts one-way costs from correctly aligned close-to-close returns", () => {
    const { book } = baseline;
    let prev: number[] | null = null;
    for (let i = 0; i < book.dailyReturns.length; i++) {
      const date = book.evaluationDates[i]!;
      const t = UNIVERSE.dates.indexOf(date);
      const target = book.holdings[date]!;
      const turnover = prev
        ? target.reduce((sum, weight, s) => sum + Math.abs(weight - (prev?.[s] ?? 0)), 0) / 2
        : target.reduce((sum, weight) => sum + Math.abs(weight), 0) / 2;
      const gross = target.reduce((sum, weight, s) => {
        const bars = UNIVERSE.bars[UNIVERSE.tickers[s]!.id]!;
        return sum + weight * (bars[t + 1]!.close / bars[t]!.close - 1);
      }, 0);
      const expected = gross - turnover * book.costBps / 10_000;
      expect(book.dailyReturns[i]).toBeCloseTo(expected, 10);
      const equalWeight = UNIVERSE.tickers.reduce((sum, ticker) => {
        const bars = UNIVERSE.bars[ticker.id]!;
        return sum + (bars[t + 1]!.close / bars[t]!.close - 1) / UNIVERSE.tickers.length;
      }, 0);
      expect(book.benchReturns[i]).toBeCloseTo(equalWeight, 10);
      prev = target;
    }
  });

  it("does not let future price changes alter earlier selections or holdings", () => {
    const cut = Math.floor(UNIVERSE.dates.length * 0.91);
    const altered: Universe = structuredClone(UNIVERSE);
    altered.tickers.forEach(({ id }, s) => {
      for (let t = cut; t < altered.dates.length; t++) {
        const bar = altered.bars[id]![t]!;
        const factor = 0.7 + s * 0.08;
        bar.open *= factor;
        bar.high *= factor;
        bar.low *= factor;
        bar.close *= factor;
        bar.vwap *= factor;
        bar.volume *= 1 + s * 0.1;
      }
    });
    const changed = runPipeline(altered);
    expect(changed.book.selected.map((alpha) => alpha.id)).toEqual(
      baseline.book.selected.map((alpha) => alpha.id),
    );
    const cutDate = UNIVERSE.dates[cut]!;
    for (const [date, weights] of Object.entries(baseline.book.holdings)) {
      if (date < cutDate) expect(changed.book.holdings[date]).toEqual(weights);
    }

    const trainingEnd = Math.floor(UNIVERSE.dates.length * 0.6);
    const trainingUniverse: Universe = {
      ...UNIVERSE,
      dates: UNIVERSE.dates.slice(0, trainingEnd),
      regimes: UNIVERSE.regimes.slice(0, trainingEnd),
      bars: Object.fromEntries(
        UNIVERSE.tickers.map(({ id }) => [id, UNIVERSE.bars[id]!.slice(0, trainingEnd)]),
      ),
    };
    const candidate = evaluateSeed(buildPanel(trainingUniverse), SEED_LIBRARY[0]!);
    const originalBook = walkForwardBacktest(buildPanel(UNIVERSE), [candidate], UNIVERSE);
    const changedBook = walkForwardBacktest(buildPanel(altered), [candidate], altered);
    expect(Object.values(originalBook.holdings).some((weights) => weights.some((w) => w > 0))).toBe(true);
    for (const [date, weights] of Object.entries(originalBook.holdings)) {
      if (date < cutDate) expect(changedBook.holdings[date]).toEqual(weights);
    }
  });
});
