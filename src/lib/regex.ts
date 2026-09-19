export type RegexInput = { pattern: string; flags: string; sample: string };
export type RegexResult =
  | { ok: true; matches: { text: string; index: number }[]; truncated: boolean }
  | { ok: false; message: string };

export function evaluateRegex({ pattern, flags, sample }: RegexInput): RegexResult {
  try {
    if (!pattern) return { ok: true, matches: [], truncated: false };
    const regex = new RegExp(pattern, flags.includes("g") ? flags : `${flags}g`);
    const matches: { text: string; index: number }[] = [];
    // Stop iterating at the limit instead of allocating every match first.
    for (const match of sample.matchAll(regex)) {
      if (matches.length === 200) return { ok: true, matches, truncated: true };
      matches.push({ text: match[0], index: match.index });
    }
    return { ok: true, matches, truncated: false };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Invalid regex" };
  }
}
