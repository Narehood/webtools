import { useEffect, useState, type FormEvent } from "react";

type PortResult = {
  open: boolean;
  host: string;
  port: number;
  ms: number;
  error?: string;
};

export function PortTool() {
  const [host, setHost] = useState("example.com");
  const [port, setPort] = useState("443");
  const [result, setResult] = useState<PortResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/port", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host, port }),
      });
      const payload = (await response.json()) as PortResult & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Check failed");
      setResult(payload);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "Check failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="tool-head">
        <span className="badge network">This server</span>
        <h1>Port check</h1>
        <p className="lede">TCP connect from this machine to one host and one port. Not a scan.</p>
      </header>
      <div className="workspace">
        <form className="panel" onSubmit={onSubmit}>
          <label className="field">
            <span>Host</span>
            <input value={host} onChange={(event) => setHost(event.target.value)} />
          </label>
          <label className="field" style={{ marginTop: 12 }}>
            <span>Port</span>
            <input value={port} onChange={(event) => setPort(event.target.value)} inputMode="numeric" />
          </label>
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn" disabled={busy}>
              {busy ? "Connecting…" : "Check"}
            </button>
          </div>
        </form>
        <section className="panel">
          {error && <p className="lede">{error}</p>}
          {result ? (
            <div className="stack">
              <span className={`status-pill ${result.open ? "up" : "down"}`}>
                {result.open ? "Open" : "Closed"} · {result.host}:{result.port}
              </span>
              <div className="stat-grid">
                <div className="stat">
                  <span>Latency</span>
                  <b>{result.ms} ms</b>
                </div>
                <div className="stat">
                  <span>Note</span>
                  <b className="wrap">{result.error || "Connected"}</b>
                </div>
              </div>
            </div>
          ) : (
            !error && <p className="lede">Reachability from this container lands here.</p>
          )}
        </section>
      </div>
    </>
  );
}

type EgressResult = { ip: string; source: string; checkedAt: string };

export function EgressTool() {
  const [server, setServer] = useState<EgressResult | null>(null);
  const [browser, setBrowser] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/egress");
      const payload = (await response.json()) as EgressResult & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Lookup failed");
      setServer(payload);
    } catch (err) {
      setServer(null);
      setError(err instanceof Error ? err.message : "Lookup failed");
    }
    try {
      const response = await fetch("https://api.ipify.org?format=json");
      const payload = (await response.json()) as { ip?: string };
      setBrowser(payload.ip ?? "");
    } catch {
      setBrowser("");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <>
      <header className="tool-head">
        <span className="badge network">This server</span>
        <h1>Egress IP</h1>
        <p className="lede">
          Public address this container uses on the internet, compared with what this browser sees.
        </p>
      </header>
      <div className="workspace">
        <section className="panel">
          <p className="lede" style={{ marginBottom: 16 }}>
            Useful when a tunnel, CGNAT, or Docker network is not the IP you expected.
          </p>
          <button className="btn" onClick={() => void refresh()} disabled={busy}>
            {busy ? "Checking…" : "Refresh"}
          </button>
        </section>
        <section className="panel">
          {error && <p className="lede">{error}</p>}
          <div className="stat-grid">
            <div className="stat">
              <span>This server</span>
              <b className="wrap">{server?.ip || "—"}</b>
            </div>
            <div className="stat">
              <span>This browser</span>
              <b className="wrap">{browser || "—"}</b>
            </div>
          </div>
          {server && (
            <p className="lede" style={{ marginTop: 12, marginBottom: 0 }}>
              Source {server.source} · {new Date(server.checkedAt).toLocaleString()}
            </p>
          )}
        </section>
      </div>
    </>
  );
}

type PtrResult = { ip: string; names: string[]; error?: string };

export function PtrTool() {
  const [ip, setIp] = useState("1.1.1.1");
  const [result, setResult] = useState<PtrResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/ptr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip }),
      });
      const payload = (await response.json()) as PtrResult & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "PTR failed");
      setResult(payload);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "PTR failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="tool-head">
        <span className="badge network">This server</span>
        <h1>Reverse DNS</h1>
        <p className="lede">PTR lookup from this host’s resolver. Forward lookup lives under DNS.</p>
      </header>
      <div className="workspace">
        <form className="panel" onSubmit={onSubmit}>
          <label className="field">
            <span>IPv4 or IPv6</span>
            <input value={ip} onChange={(event) => setIp(event.target.value)} />
          </label>
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn" disabled={busy}>
              {busy ? "Looking up…" : "Look up PTR"}
            </button>
          </div>
        </form>
        <section className="panel">
          {error && <p className="lede">{error}</p>}
          {result ? (
            <div className="stack">
              <div className="stat">
                <span>Names</span>
                <b className="wrap">{result.names.join(", ") || result.error || "No PTR"}</b>
              </div>
            </div>
          ) : (
            !error && <p className="lede">PTR names land here.</p>
          )}
        </section>
      </div>
    </>
  );
}
