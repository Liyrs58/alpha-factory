import type { AstNode, BinOp } from "../types";

export class ParseError extends Error {
  constructor(
    message: string,
    readonly pos: number,
    readonly src: string,
  ) {
    super(message);
    this.name = "ParseError";
  }
}

const FIELDS = new Set([
  "open",
  "high",
  "low",
  "close",
  "volume",
  "vwap",
  "returns",
  "rsi",
  "atr",
  "boll_up",
  "boll_down",
  "typical",
  "macd",
]);

const FIELD_ALIAS: Record<string, string> = {
  o: "open",
  h: "high",
  l: "low",
  c: "close",
  v: "volume",
  vol: "volume",
  ret: "returns",
  return: "returns",
  upper_band: "boll_up",
  lower_band: "boll_down",
  bollup: "boll_up",
  bolldown: "boll_down",
};

export function canonicalizeIdent(raw: string): string {
  const k = raw.toLowerCase().replace(/[\s.]+/g, "_");
  return FIELD_ALIAS[k] ?? k;
}

class Parser {
  i = 0;
  constructor(readonly src: string) {}

  peek(): string {
    return this.src[this.i] ?? "";
  }

  eof(): boolean {
    return this.i >= this.src.length;
  }

  skip() {
    while (this.i < this.src.length && /[\s,]/.test(this.src[this.i])) this.i++;
  }

  error(msg: string): never {
    throw new ParseError(`${msg} at ${this.i}`, this.i, this.src);
  }

  parseExpr(): AstNode {
    return this.parseCmp();
  }

  parseCmp(): AstNode {
    let left = this.parseAdd();
    this.skip();
    const op = this.tryOp([">=", "<=", "==", ">", "<"]);
    if (op) {
      const right = this.parseAdd();
      left = { type: "bin", op: op as BinOp, left, right };
    }
    return left;
  }

  parseAdd(): AstNode {
    let left = this.parseMul();
    for (;;) {
      this.skip();
      const op = this.tryOp(["+", "-"]);
      if (!op) break;
      left = { type: "bin", op: op as BinOp, left, right: this.parseMul() };
    }
    return left;
  }

  parseMul(): AstNode {
    let left = this.parseUnary();
    for (;;) {
      this.skip();
      const op = this.tryOp(["*", "/"]);
      if (!op) break;
      left = { type: "bin", op: op as BinOp, left, right: this.parseUnary() };
    }
    return left;
  }

  parseUnary(): AstNode {
    this.skip();
    if (this.peek() === "-") {
      this.i++;
      return { type: "un", op: "-", arg: this.parseUnary() };
    }
    if (this.peek() === "+") {
      this.i++;
      return this.parseUnary();
    }
    return this.parsePow();
  }

  parsePow(): AstNode {
    let left = this.parsePrimary();
    this.skip();
    if (this.tryOp(["^"])) {
      left = { type: "bin", op: "^", left, right: this.parseUnary() };
    }
    return left;
  }

  parsePrimary(): AstNode {
    this.skip();
    const ch = this.peek();
    if (ch === "(") {
      this.i++;
      const inner = this.parseExpr();
      this.skip();
      if (this.peek() !== ")") this.error("expected ')'");
      this.i++;
      return inner;
    }
    if (/[0-9.]/.test(ch)) return this.parseNum();
    if (/[A-Za-z_]/.test(ch)) return this.parseIdentOrCall();
    this.error(`unexpected '${ch || "EOF"}'`);
  }

  parseNum(): AstNode {
    const start = this.i;
    while (/[0-9.]/.test(this.peek())) this.i++;
    const raw = this.src.slice(start, this.i);
    const value = Number(raw);
    if (!Number.isFinite(value)) this.error(`bad number '${raw}'`);
    return { type: "num", value };
  }

  parseIdentOrCall(): AstNode {
    const start = this.i;
    while (/[A-Za-z0-9_]/.test(this.peek())) this.i++;
    const name = canonicalizeIdent(this.src.slice(start, this.i));
    this.skip();
    if (this.peek() === "(") {
      this.i++;
      const args: AstNode[] = [];
      this.skip();
      if (this.peek() !== ")") {
        args.push(this.parseExpr());
        for (;;) {
          this.skip();
          if (this.peek() === ")") break;
          args.push(this.parseExpr());
        }
      }
      this.skip();
      if (this.peek() !== ")") this.error(`expected ')' after ${name}(`);
      this.i++;
      return { type: "call", name, args };
    }
    if (FIELDS.has(name)) return { type: "field", name };
    // Bare operator names used as 0-arg calls: RSI, ATR, MACD
    return { type: "call", name, args: [] };
  }

  tryOp(ops: string[]): string | null {
    for (const op of ops) {
      if (this.src.startsWith(op, this.i)) {
        const next = this.src[this.i + op.length] ?? "";
        if (op === ">" || op === "<") {
          if (next === "=") continue;
        }
        this.i += op.length;
        return op;
      }
    }
    return null;
  }
}

export function parse(src: string): AstNode {
  const p = new Parser(src.trim());
  if (p.eof()) throw new ParseError("empty expression", 0, src);
  const node = p.parseExpr();
  p.skip();
  if (!p.eof()) p.error(`trailing input '${p.src.slice(p.i)}'`);
  return node;
}

const PREC: Record<string, number> = {
  "^": 4,
  "*": 3,
  "/": 3,
  "+": 2,
  "-": 2,
  ">": 1,
  "<": 1,
  ">=": 1,
  "<=": 1,
  "==": 1,
};

export function formatInfix(node: AstNode, parentPrec = 0): string {
  switch (node.type) {
    case "num":
      return String(node.value);
    case "field":
      return node.name;
    case "un": {
      const inner = formatInfix(node.arg, 5);
      return node.arg.type === "bin" ? `-(${inner})` : `-${inner}`;
    }
    case "bin": {
      const p = PREC[node.op] ?? 0;
      const left = formatInfix(node.left, p);
      const right = formatInfix(node.right, p + (node.op === "^" ? 0 : 0.1));
      const s = `${left} ${node.op} ${right}`;
      return p < parentPrec ? `(${s})` : s;
    }
    case "call":
      return `${node.name}(${node.args.map((a) => formatInfix(a)).join(", ")})`;
    default: {
      const _x: never = node;
      return _x;
    }
  }
}

export function formatSource(src: string): string {
  return formatInfix(parse(src));
}

export function setDelayWindows(src: string, days: number): string {
  return formatInfix(mapDelay(parse(src), days));
}

function mapDelay(node: AstNode, days: number): AstNode {
  switch (node.type) {
    case "num":
    case "field":
      return node;
    case "un":
      return { ...node, arg: mapDelay(node.arg, days) };
    case "bin":
      return { ...node, left: mapDelay(node.left, days), right: mapDelay(node.right, days) };
    case "call": {
      const args = node.args.map((a) => mapDelay(a, days));
      if (
        (node.name === "delay" || node.name === "ts_delta" || node.name === "ts_delay" || node.name === "ref") &&
        args[1]?.type === "num"
      ) {
        return { ...node, args: [args[0]!, { type: "num", value: days }] };
      }
      return { ...node, args };
    }
    default: {
      const _x: never = node;
      return _x;
    }
  }
}

export function pretty(node: AstNode): string {
  switch (node.type) {
    case "num":
      return String(node.value);
    case "field":
      return node.name;
    case "un":
      return `(- ${pretty(node.arg)})`;
    case "bin":
      return `(${node.op} ${pretty(node.left)} ${pretty(node.right)})`;
    case "call":
      return node.args.length
        ? `(${node.name} ${node.args.map(pretty).join(" ")})`
        : `(${node.name})`;
    default: {
      const _x: never = node;
      return _x;
    }
  }
}

export type Token = { text: string; kind: "fn" | "field" | "num" | "op" | "punct" | "ws" };

export function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      let j = i + 1;
      while (j < src.length && /\s/.test(src[j])) j++;
      tokens.push({ text: src.slice(i, j), kind: "ws" });
      i = j;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i + 1;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      tokens.push({ text: src.slice(i, j), kind: "num" });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i + 1;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      const raw = src.slice(i, j);
      const name = canonicalizeIdent(raw);
      let k = j;
      while (k < src.length && /\s/.test(src[k])) k++;
      const isCall = src[k] === "(";
      tokens.push({
        text: raw,
        kind: isCall || !FIELDS.has(name) ? "fn" : "field",
      });
      i = j;
      continue;
    }
    if ("+-*/^<>=()".includes(ch)) {
      if ((ch === ">" || ch === "<" || ch === "=") && src[i + 1] === "=") {
        tokens.push({ text: src.slice(i, i + 2), kind: "op" });
        i += 2;
      } else {
        tokens.push({ text: ch, kind: ch === "(" || ch === ")" ? "punct" : "op" });
        i++;
      }
      continue;
    }
    if (ch === ",") {
      tokens.push({ text: ",", kind: "punct" });
      i++;
      continue;
    }
    tokens.push({ text: ch, kind: "punct" });
    i++;
  }
  return tokens;
}

export type TreeLine = { depth: number; label: string; kind: Token["kind"] };

export function treeLines(node: AstNode, depth = 0): TreeLine[] {
  switch (node.type) {
    case "num":
      return [{ depth, label: String(node.value), kind: "num" }];
    case "field":
      return [{ depth, label: node.name, kind: "field" }];
    case "un":
      return [{ depth, label: "neg", kind: "op" }, ...treeLines(node.arg, depth + 1)];
    case "bin":
      return [
        { depth, label: node.op, kind: "op" },
        ...treeLines(node.left, depth + 1),
        ...treeLines(node.right, depth + 1),
      ];
    case "call":
      return [
        { depth, label: node.name, kind: "fn" },
        ...node.args.flatMap((a: AstNode) => treeLines(a, depth + 1)),
      ];
    default: {
      const _x: never = node;
      return _x;
    }
  }
}
