import { parseJsonSafely } from "./safeJson.ts";

export const DEFAULT_JSON_DIFF_MAX_BYTES = 1_000_000;
export const DEFAULT_JSON_DIFF_MAX_CHANGES = 2_000;
export const DEFAULT_JSON_DIFF_MAX_DEPTH = 256;

export type JsonDiffKind = "added" | "removed" | "changed";

export type JsonDiffChange = {
  kind: JsonDiffKind;
  path: string;
  before?: unknown;
  after?: unknown;
};

export type JsonDiffResult = {
  changes: JsonDiffChange[];
  equal: boolean;
  truncated: boolean;
};

export type JsonDiffOptions = {
  maxBytes?: number;
  maxChanges?: number;
  maxDepth?: number;
};

type WorkItem = { before: unknown; after: unknown; path: string };

export function diffJsonText(beforeText: string, afterText: string, options: JsonDiffOptions = {}): JsonDiffResult {
  const maxBytes = options.maxBytes ?? DEFAULT_JSON_DIFF_MAX_BYTES;
  const maxChanges = options.maxChanges ?? DEFAULT_JSON_DIFF_MAX_CHANGES;
  const maxDepth = options.maxDepth ?? DEFAULT_JSON_DIFF_MAX_DEPTH;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error("JSON diff byte limit must be a positive integer");
  if (!Number.isSafeInteger(maxChanges) || maxChanges < 1) throw new Error("JSON diff change limit must be a positive integer");
  if (!Number.isSafeInteger(maxDepth) || maxDepth < 1) throw new Error("JSON diff depth limit must be a positive integer");

  assertSize(beforeText, "Before", maxBytes);
  assertSize(afterText, "After", maxBytes);
  const before = parseDocument(beforeText, "Before");
  const after = parseDocument(afterText, "After");
  assertDepth(before, "Before", maxDepth);
  assertDepth(after, "After", maxDepth);
  const changes: JsonDiffChange[] = [];
  const work: WorkItem[] = [{ before, after, path: "$" }];
  let truncated = false;

  const add = (change: JsonDiffChange) => {
    if (changes.length >= maxChanges) {
      truncated = true;
      return false;
    }
    changes.push(change);
    return true;
  };

  while (work.length && !truncated) {
    const item = work.pop()!;
    if (jsonValuesEqual(item.before, item.after)) continue;

    if (Array.isArray(item.before) && Array.isArray(item.after)) {
      const longest = Math.max(item.before.length, item.after.length);
      for (let index = longest - 1; index >= 0; index -= 1) {
        const path = `${item.path}[${index}]`;
        if (index >= item.before.length) {
          if (!add({ kind: "added", path, after: item.after[index] })) break;
        } else if (index >= item.after.length) {
          if (!add({ kind: "removed", path, before: item.before[index] })) break;
        } else {
          work.push({ before: item.before[index], after: item.after[index], path });
        }
      }
      continue;
    }

    if (isJsonObject(item.before) && isJsonObject(item.after)) {
      const keys = [...new Set([...Object.keys(item.before), ...Object.keys(item.after)])].sort().reverse();
      for (const key of keys) {
        const path = appendJsonPath(item.path, key);
        const hadBefore = Object.hasOwn(item.before, key);
        const hasAfter = Object.hasOwn(item.after, key);
        if (!hadBefore) {
          if (!add({ kind: "added", path, after: item.after[key] })) break;
        } else if (!hasAfter) {
          if (!add({ kind: "removed", path, before: item.before[key] })) break;
        } else {
          work.push({ before: item.before[key], after: item.after[key], path });
        }
      }
      continue;
    }

    add({ kind: "changed", path: item.path, before: item.before, after: item.after });
  }

  changes.sort((left, right) => left.path.localeCompare(right.path, undefined, { numeric: true }));
  return { changes, equal: changes.length === 0 && !truncated, truncated };
}

export function appendJsonPath(parent: string, key: string) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
    ? `${parent}.${key}`
    : `${parent}[${JSON.stringify(key)}]`;
}

export function formatJsonDiffValue(value: unknown, maxLength = 240) {
  let text: string;
  try {
    const serialized = JSON.stringify(value);
    text = serialized === undefined ? String(value) : serialized;
  } catch {
    text = "[Value is too deeply nested to display]";
  }
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 1))}…` : text;
}

function assertSize(text: string, label: string, maxBytes: number) {
  const bytes = new TextEncoder().encode(text).byteLength;
  if (bytes > maxBytes) {
    throw new Error(`${label} JSON is ${bytes.toLocaleString()} bytes; the limit is ${maxBytes.toLocaleString()} bytes`);
  }
}

function parseDocument(text: string, label: string): unknown {
  if (!text.trim()) throw new Error(`${label} JSON is empty`);
  try {
    return parseJsonSafely(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON";
    const position = /position\s+(\d+)/i.exec(message);
    if (!position) throw new Error(`${label} JSON: ${message}`);
    const offset = Number(position[1]);
    const prefix = text.slice(0, offset);
    const line = prefix.split(/\r\n|\n|\r/).length;
    const lastBreak = Math.max(prefix.lastIndexOf("\n"), prefix.lastIndexOf("\r"));
    const column = offset - lastBreak;
    throw new Error(`${label} JSON at line ${line}, column ${column}: ${message}`);
  }
}

function assertDepth(value: unknown, label: string, maxDepth: number) {
  const stack = [{ value, depth: 0 }];
  while (stack.length) {
    const item = stack.pop()!;
    if (item.depth > maxDepth) throw new Error(`${label} JSON is nested more than ${maxDepth} levels deep`);
    if (Array.isArray(item.value)) {
      for (const child of item.value) stack.push({ value: child, depth: item.depth + 1 });
    } else if (isJsonObject(item.value)) {
      for (const child of Object.values(item.value)) stack.push({ value: child, depth: item.depth + 1 });
    }
  }
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonValuesEqual(before: unknown, after: unknown) {
  return before === after || (typeof before === "number" && typeof after === "number" && Number.isNaN(before) && Number.isNaN(after));
}
