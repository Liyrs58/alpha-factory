import { SEED_LIBRARY } from "./alphas/library";
import { parse, pretty } from "./alphas/parser";
import { buildPanel, evalExpression } from "./alphas/eval";
import { UNIVERSE } from "./data/universe";
import { runPipeline } from "./agents/pipeline";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

function main() {
  for (const seed of SEED_LIBRARY) {
    const ast = parse(seed.expression);
    assert(pretty(ast).length > 0, `pretty failed ${seed.id}`);
  }
  const panel = buildPanel(UNIVERSE);
  assert(panel.nS === 10, "expected 10 names");
  assert(panel.nT > 900, "expected multi-year trading days");

  for (const seed of SEED_LIBRARY) {
    const v = evalExpression(seed.expression, panel);
    let finite = 0;
    for (let i = 0; i < v.length; i++) if (Number.isFinite(v[i])) finite++;
    assert(finite > 200, `${seed.id} produced too few values (${finite})`);
  }

  const result = runPipeline(UNIVERSE);
  assert(result.evaluated.length === SEED_LIBRARY.length, "eval count");
  assert(result.book.selected.length >= 3, "book too small");
  assert(result.book.equity.length > 10, "equity");
  console.log(
    JSON.stringify(
      {
        dates: UNIVERSE.dates.length,
        proposed: result.proposed.length,
        selected: result.book.selected.map((a) => a.id),
        sharpe: Number(result.book.metrics.sharpe.toFixed(3)),
        ret: Number((result.book.metrics.totalReturn * 100).toFixed(2)),
        ic: Number(result.book.metrics.ic.toFixed(4)),
        benchSharpe: Number(result.book.benchMetrics.sharpe.toFixed(3)),
      },
      null,
      2,
    ),
  );
}

main();
