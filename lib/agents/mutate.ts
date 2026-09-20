import { formatInfix, parse } from "../alphas/parser";
import type { AstNode } from "../types";

export type Mutation = {
  expression: string;
  label: string;
  note: string;
};

const WINDOW_FNS = new Set([
  "delay",
  "ts_delta",
  "ts_delay",
  "ref",
  "sma",
  "ema",
  "ts_mean",
  "ts_std",
  "std",
  "ts_sum",
  "ts_max",
  "ts_min",
  "ts_rank",
]);

function mapNode(node: AstNode, fn: (n: AstNode) => AstNode): AstNode {
  switch (node.type) {
    case "num":
    case "field":
      return fn(node);
    case "un":
      return fn({ ...node, arg: mapNode(node.arg, fn) });
    case "bin":
      return fn({ ...node, left: mapNode(node.left, fn), right: mapNode(node.right, fn) });
    case "call":
      return fn({ ...node, args: node.args.map((a) => mapNode(a, fn)) });
    default: {
      const _x: never = node;
      return _x;
    }
  }
}

function scaleWindows(node: AstNode, factor: number): AstNode {
  return mapNode(node, (n) => {
    if (n.type !== "call" || !WINDOW_FNS.has(n.name)) return n;
    const args = n.args.map((a, i) => {
      if (i === 0 || a.type !== "num") return a;
      const next = Math.max(2, Math.round(a.value * factor));
      return { type: "num" as const, value: next === a.value ? a.value + 2 : next };
    });
    return { ...n, args };
  });
}

function containsCall(node: AstNode, name: string): boolean {
  switch (node.type) {
    case "num":
    case "field":
      return false;
    case "un":
      return containsCall(node.arg, name);
    case "bin":
      return containsCall(node.left, name) || containsCall(node.right, name);
    case "call":
      return node.name === name || node.args.some((a) => containsCall(a, name));
    default:
      return false;
  }
}

function wrapCall(name: string, inner: AstNode, extra?: AstNode): AstNode {
  return extra ? { type: "call", name, args: [inner, extra] } : { type: "call", name, args: [inner] };
}

function tryMut(src: string, build: () => AstNode, label: string, note: string): Mutation | null {
  try {
    const expr = formatInfix(build());
    const orig = formatInfix(parse(src));
    if (expr === orig) return null;
    parse(expr);
    return { expression: expr, label, note };
  } catch {
    return null;
  }
}

/** Deterministic critic rewrites. Same (src, generation) always yields the same unused variant. */
export function criticRewrite(src: string, generation: number, taken: Iterable<string> = []): Mutation {
  const used = new Set([...taken].map((s) => s.replace(/\s+/g, "")));
  const ast = parse(src);
  const num = (v: number): AstNode => ({ type: "num", value: v });
  const field = (name: string): AstNode => ({ type: "field", name });

  const raw: Array<Mutation | null> = [
    tryMut(src, () => scaleWindows(ast, 2), "window ×2", "Critic: lengthen lookback; slow the signal vs microstructure noise."),
    tryMut(src, () => scaleWindows(ast, 0.5), "window ×½", "Critic: shorten lookback; restore faster IC decay."),
    tryMut(
      src,
      () => (containsCall(ast, "zscore") ? scaleWindows(ast, 1.5) : wrapCall("zscore", ast)),
      containsCall(ast, "zscore") ? "window ×1.5" : "wrap zscore",
      "Critic: cross-sectional neutralize (paper CSA likes z-scored α).",
    ),
    tryMut(
      src,
      () => ({
        type: "bin",
        op: "-",
        left: wrapCall("rank", ast),
        right: wrapCall("rank", field("volume")),
      }),
      "rank − rank(volume)",
      "Critic: subtract volume rank to cut liquidity crowding.",
    ),
    tryMut(src, () => ({ type: "un", op: "-", arg: ast }), "sign flip", "Critic: invert sign after negative IC."),
    tryMut(
      src,
      () => wrapCall("ts_rank", ast, num(10)),
      "ts_rank 10",
      "Critic: time-series rank compresses outliers before the book.",
    ),
    tryMut(
      src,
      () => ({
        type: "bin",
        op: "/",
        left: ast,
        right: wrapCall("ts_std", field("close"), num(20)),
      }),
      "/ ts_std(close,20)",
      "Critic: vol-scale so bear regimes do not dominate the ridge.",
    ),
    tryMut(
      src,
      () => wrapCall("rank", wrapCall("ts_delta", ast, num(5))),
      "rank ts_delta 5",
      "Critic: take the 5-day change of the residual, then rank.",
    ),
  ];

  const uniq: Mutation[] = [];
  for (const m of raw) {
    if (!m) continue;
    const key = m.expression.replace(/\s+/g, "");
    if (used.has(key) || uniq.some((u) => u.expression.replace(/\s+/g, "") === key)) continue;
    uniq.push(m);
  }
  if (uniq.length === 0) {
    return {
      expression: formatInfix({
        type: "bin",
        op: "-",
        left: wrapCall("rank", ast),
        right: wrapCall("rank", wrapCall("delay", field("volume"), num(5))),
      }),
      label: "rank − delayed volume",
      note: "Critic: last-resort liquidity residual.",
    };
  }
  return uniq[generation % uniq.length]!;
}

export function nextRefinedId(parentId: string, existingIds: Iterable<string>): string {
  const base = parentId.replace(/R\d+$/, "");
  let n = 1;
  const have = new Set(existingIds);
  while (have.has(`${base}R${n}`)) n += 1;
  return `${base}R${n}`;
}
