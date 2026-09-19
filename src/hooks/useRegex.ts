import { useEffect, useState } from "react";
import type { RegexInput, RegexResult } from "../lib/regex";

export function useRegex({ pattern, flags, sample }: RegexInput) {
  const [result, setResult] = useState<RegexResult | null>(null);
  useEffect(() => {
    setResult(null);
    let worker: Worker | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const debounce = setTimeout(() => {
      const finish = (value: RegexResult) => {
        clearTimeout(timeout);
        worker?.terminate();
        setResult(value);
      };
      try {
        worker = new Worker(new URL("../workers/regex.worker.ts", import.meta.url), { type: "module" });
        worker.onmessage = (event: MessageEvent<RegexResult>) => finish(event.data);
        worker.onerror = () => finish({ ok: false, message: "Could not run the regex worker" });
        timeout = setTimeout(() => finish({ ok: false, message: "Regex took too long. Simplify the pattern or shorten the sample." }), 1000);
        worker.postMessage({ pattern, flags, sample });
      } catch (error) {
        finish({ ok: false, message: error instanceof Error ? error.message : "Could not run regex" });
      }
    }, 150);
    return () => {
      clearTimeout(debounce);
      clearTimeout(timeout);
      worker?.terminate();
    };
  }, [pattern, flags, sample]);
  return result;
}
