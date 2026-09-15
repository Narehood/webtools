import { useState, type FormEvent } from "react";

type StatusResult = {
  up: boolean;
  ok: boolean;
  status: number;
  statusText: string;
  url: string;
  redirected: boolean;
  ms: number;
  checkedAt: string;
  error?: string;
};

export function StatusTool() {
  const [url, setUrl] = useState("https://example.com");
  const [result, setResult] = useState<StatusResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const payload = (await response.json()) as StatusResult & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Lookup failed");
      setResult(payload);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="tool-head">
        <span className="badge network">This server</span>
        <h1>Site status</h1>
        <p className="lede">
          This host reaches out on your behalf, so CORS never gets in the way. You get status code,
          timing, and the final URL after redirects.
        </p>
      </header>
      <div className="workspace">
        <form className="panel" onSubmit={onSubmit}>
          <label className="field">
            <span>URL or hostname</span>
            <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="status.example" />
          </label>
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn" disabled={busy}>
              {busy ? "Checking…" : "Check status"}
            </button>
          </div>
        </form>
        <section className="panel">
          {error && <p className="lede">{error}</p>}
          {result ? (
            <div className="stack">
              <span className={`status-pill ${result.up ? "up" : "down"}`}>
                {result.up ? "Up" : "Down"} · {result.status || "no response"} {result.statusText}
              </span>
              <div className="stat-grid">
                <div className="stat">
                  <span>Latency</span>
                  <b>{result.ms} ms</b>
                </div>
                <div className="stat">
                  <span>Redirected</span>
                  <b>{result.redirected ? "Yes" : "No"}</b>
                </div>
              </div>
              <p className="lede" style={{ marginBottom: 0 }}>
                Final URL: {result.url}
                <br />
                Checked {new Date(result.checkedAt).toLocaleString()}
              </p>
            </div>
          ) : (
            <p className="lede">Results land here. Try a hostname you actually care about.</p>
          )}
        </section>
      </div>
    </>
  );
}
