import { useEffect, useState } from "react";

export function useObjectUrl(blob: Blob | null) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!blob) { setUrl(""); return; }
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url;
}
