// Inspect source tokens because JSON.parse has already rounded large integers.
// Strings (including escaped quotes) are consumed as whole tokens and skipped.
export function parseJsonSafely(text: string): unknown {
  const value: unknown = JSON.parse(text);
  const tokens = /"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
  for (const match of text.matchAll(tokens)) {
    if (match[0].startsWith('"')) continue;
    const number = Number(match[0]);
    const problem = !Number.isFinite(number) ? "Nonfinite numbers cannot be represented in JSON" :
      /^-?\d+$/.test(match[0]) && !Number.isSafeInteger(number) ? "Integer exceeds the safe integer range" : "";
    if (problem) {
      const prefix = text.slice(0, match.index);
      const line = prefix.split(/\r\n|\n|\r/).length;
      const column = match.index - Math.max(prefix.lastIndexOf("\n"), prefix.lastIndexOf("\r"));
      throw new Error(`${problem} at line ${line}, column ${column}; quote the value to keep it exact.`);
    }
  }
  return value;
}

export function formatJson(text: string, minified = false) {
  return JSON.stringify(parseJsonSafely(text), null, minified ? 0 : 2);
}
