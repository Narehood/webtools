import { useState, type FormEvent } from "react";

type DomainHealthState = "ok" | "notice" | "error";

type DomainHealthCheck = {
  id: string;
  label: string;
  state: DomainHealthState;
  summary: string;
  details: string[];
};

type DomainHealthReport = {
  target: { domain: string; url: string };
  checkedAt: string;
  checks: DomainHealthCheck[];
};

function stateLabel(state: DomainHealthState) {
  if (state === "ok") return "Completed";
  if (state === "notice") return "Review";
  return "Unavailable";
}

export function DomainHealthTool() {
  const [target, setTarget] = useState("example.com");
  const [report, setReport] = useState<DomainHealthReport | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setReport(null);
    try {
      const response = await fetch("/api/domain-health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: target }),
      });
      const payload = await response.json() as DomainHealthReport & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Domain health check failed");
      setReport(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Domain health check failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="tool-head">
        <span className="badge network">This server</span>
        <h1>Domain health check</h1>
        <p className="lede">
          Check site availability, DNS, TLS, headers, mail records, and site files from this server.
          Each result stands on its own; this is an observation report, not a security grade.
        </p>
      </header>
      <div className="workspace report">
        <form className="panel" onSubmit={onSubmit}>
          <label className="field">
            <span>Domain or URL</span>
            <input
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              placeholder="example.com"
            />
          </label>
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn" disabled={busy}>
              {busy ? "Running checks…" : "Check domain"}
            </button>
          </div>
        </form>
        <section className="panel">
          {error ? <p className="lede" role="alert">{error}</p> : null}
          {report ? (
            <div className="stack">
              <div>
                <h2>{report.target.domain}</h2>
                <p className="record-empty">
                  {report.target.url}<br />
                  Checked {new Date(report.checkedAt).toLocaleString()}
                </p>
              </div>
              {report.checks.map((check) => (
                <article className="record-block" key={check.id}>
                  <h3>
                    {check.label}
                    <span>{stateLabel(check.state)}</span>
                  </h3>
                  <p>
                    <span className={`status-pill ${check.state === "ok" ? "up" : check.state === "error" ? "down" : ""}`}>
                      {check.summary}
                    </span>
                  </p>
                  {check.details.length ? (
                    <ul className="record-list">
                      {check.details.map((detail, index) => <li key={`${detail}-${index}`}>{detail}</li>)}
                    </ul>
                  ) : null}
                </article>
              ))}
            </div>
          ) : !error ? (
            <p className="lede">Six independent checks and their partial failures appear here.</p>
          ) : null}
        </section>
      </div>
    </>
  );
}
