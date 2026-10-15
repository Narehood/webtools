import { useEffect, useState } from "react";
import { copyText } from "../lib/clipboard";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => setDone(false), 1200);
    return () => clearTimeout(timer);
  }, [done]);
  useEffect(() => { setDone(false); setError(""); }, [text]);

  return (
    <>
      <button
        className="btn ghost"
        type="button"
        disabled={!text}
        onClick={() => {
          setError("");
          void copyText(text).then(() => {
            setDone(true);
          }).catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not copy. Select and copy the output manually."));
        }}
      >
        {done ? "Copied" : label}
      </button>
      {error && <span role="alert" className="lede">{error}</span>}
    </>
  );
}
