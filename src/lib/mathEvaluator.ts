import { boundedText } from "./utilityCore.ts";

const functions: Record<string, (...values: number[]) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  abs: Math.abs,
  exp: Math.exp,
  ln: Math.log,
  log: Math.log10,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
};
const arity: Record<string, number | null> = { min: null, max: null, pow: 2 };

export function evaluateMath(raw: string) {
  const text = boundedText(raw, 2000);
  const tokens =
    text.match(
      /(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[a-zA-Z]+|\*\*|[^\s]/g,
    ) ?? [];
  if (!tokens.length || tokens.length > 512)
    throw new Error("Enter an expression with at most 512 tokens.");
  let cursor = 0;
  let depth = 0;
  function expression(minPrecedence = 0): number {
    if (++depth > 64) throw new Error("Expression is nested too deeply.");
    const token = tokens[cursor++];
    let left: number;
    if (token === "+" || token === "-")
      left = (token === "-" ? -1 : 1) * expression(3);
    else if (token === "(") {
      left = expression();
      if (tokens[cursor++] !== ")")
        throw new Error("Expected a closing parenthesis.");
    } else if (/^(?:\d|\.\d)/.test(token ?? "")) left = Number(token);
    else if (token?.toLowerCase() === "pi") left = Math.PI;
    else if (token === "e") left = Math.E;
    else if (token && Object.hasOwn(functions, token)) {
      if (tokens[cursor++] !== "(") throw new Error(`Use ${token}(…).`);
      const args: number[] = [];
      if (tokens[cursor] !== ")") {
        do {
          args.push(expression());
        } while (tokens[cursor] === "," && ++cursor);
      }
      if (tokens[cursor++] !== ")")
        throw new Error("Expected a closing parenthesis.");
      const expected = Object.hasOwn(arity, token) ? arity[token] : 1;
      if (args.length === 0 || (expected !== null && args.length !== expected))
        throw new Error(
          `${token} expects ${expected ?? "one or more"} argument(s).`,
        );
      left = functions[token](...args);
    } else throw new Error(`Unexpected token: ${token ?? "end of input"}.`);
    while (cursor < tokens.length) {
      const op = tokens[cursor];
      const precedence =
        op === "+" || op === "-"
          ? 1
          : ["*", "/", "%"].includes(op)
            ? 2
            : op === "^" || op === "**"
              ? 4
              : -1;
      if (precedence < minPrecedence) break;
      cursor++;
      const right = expression(precedence + (precedence === 4 ? 0 : 1));
      left =
        op === "+"
          ? left + right
          : op === "-"
            ? left - right
            : op === "*"
              ? left * right
              : op === "/"
                ? left / right
                : op === "%"
                  ? left % right
                  : left ** right;
    }
    depth--;
    return left;
  }
  const result = expression();
  if (cursor !== tokens.length)
    throw new Error(`Unexpected token: ${tokens[cursor]}.`);
  if (!Number.isFinite(result))
    throw new Error(
      "The result is undefined or outside the finite number range.",
    );
  return Object.is(result, -0) ? 0 : result;
}

export function benchmarkStats(raw: string) {
  const tokens = boundedText(raw, 100_000)
    .trim()
    .split(/[\s,;]+/);
  if (tokens.length > 10000 || !tokens[0])
    throw new Error("Enter 1–10,000 durations in milliseconds.");
  const samples = tokens.map(Number);
  if (samples.some((value) => !Number.isFinite(value) || value < 0))
    throw new Error("Durations must be finite, nonnegative numbers.");
  const sorted = [...samples].sort((a, b) => a - b);
  const mean =
    samples.reduce((total, value) => total + value, 0) / samples.length;
  const middle = Math.floor(samples.length / 2);
  return {
    count: samples.length,
    min: sorted[0],
    max: sorted.at(-1)!,
    mean,
    median:
      samples.length % 2
        ? sorted[middle]
        : (sorted[middle - 1] + sorted[middle]) / 2,
    p95: sorted[Math.ceil(samples.length * 0.95) - 1],
    standardDeviation: Math.sqrt(
      samples.reduce((total, value) => total + (value - mean) ** 2, 0) /
        samples.length,
    ),
  };
}
