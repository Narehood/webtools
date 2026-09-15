import { useState, type FormEvent } from "react";

type SslResult = {
  host: string;
  port: number;
  authorized: boolean;
  authorizationError: string | null;
  protocol: string | null;
  subject: Record<string, string>;
  issuer: Record<string, string>;
  validFrom: string;
  validTo: string;
  daysRemaining: number;
  fingerprint256: string;
  serialNumber: string;
  altNames: string;
};

export function SslTool() {
  const [url, setUrl] = useState("https://example.com");
  const [result, setResult] = useState<SslResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/ssl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "SSL lookup failed");
      setResult(payload as SslResult);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "SSL lookup failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="tool-head">
        <span className="badge network">This server</span>
        <h1>SSL certificate</h1>
        <p className="lede">This host opens a TLS session and reads the peer certificate. Nothing is stored.</p>
      </header>
      <div className="workspace">
        <form className="panel" onSubmit={onSubmit}>
          <label className="field">
            <span>Host or URL</span>
            <input value={url} onChange={(event) => setUrl(event.target.value)} />
          </label>
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn" disabled={busy}>
              {busy ? "Checking…" : "Inspect certificate"}
            </button>
          </div>
        </form>
        <section className="panel">
          {error && <p className="lede">{error}</p>}
          {result ? (
            <div className="stack">
              <span className={`status-pill ${result.authorized && result.daysRemaining > 0 ? "up" : "down"}`}>
                {result.authorized ? "Trusted" : "Not trusted"} · {result.daysRemaining} days left
              </span>
              <div className="stat-grid">
                <div className="stat">
                  <span>Issuer</span>
                  <b>{result.issuer.O || result.issuer.CN || "—"}</b>
                </div>
                <div className="stat">
                  <span>Expires</span>
                  <b>{result.validTo}</b>
                </div>
                <div className="stat">
                  <span>Protocol</span>
                  <b>{result.protocol || "—"}</b>
                </div>
                <div className="stat">
                  <span>Subject</span>
                  <b className="wrap">{result.subject.CN || result.host}</b>
                </div>
              </div>
              <p className="lede" style={{ marginBottom: 0 }}>
                {result.altNames || "No SAN listed"}
                <br />
                {result.fingerprint256}
              </p>
            </div>
          ) : (
            !error && <p className="lede">Expiry, issuer, and fingerprint land here.</p>
          )}
        </section>
      </div>
    </>
  );
}

type Hop = {
  url: string;
  status: number;
  statusText: string;
  location: string | null;
  headers: Record<string, string>;
};

export function HeadersTool() {
  const [url, setUrl] = useState("https://example.com");
  const [chain, setChain] = useState<Hop[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/headers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Lookup failed");
      setChain((payload as { chain: Hop[] }).chain);
    } catch (err) {
      setChain([]);
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="tool-head">
        <span className="badge network">This server</span>
        <h1>Headers & redirects</h1>
        <p className="lede">Follows up to ten hops from this host so you can see the chain and the headers.</p>
      </header>
      <div className="workspace">
        <form className="panel" onSubmit={onSubmit}>
          <label className="field">
            <span>URL</span>
            <input value={url} onChange={(event) => setUrl(event.target.value)} />
          </label>
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn" disabled={busy}>
              {busy ? "Tracing…" : "Trace"}
            </button>
          </div>
        </form>
        <section className="panel">
          {error && <p className="lede">{error}</p>}
          {chain.length ? (
            <div className="stack">
              {chain.map((hop, index) => (
                <div className="stat" key={`${hop.url}-${index}`}>
                  <span>
                    Hop {index + 1} · {hop.status} {hop.statusText}
                  </span>
                  <b className="wrap">{hop.url}</b>
                  <pre className="whois-block">{JSON.stringify(hop.headers, null, 2)}</pre>
                </div>
              ))}
            </div>
          ) : (
            !error && <p className="lede">The redirect chain appears here.</p>
          )}
        </section>
      </div>
    </>
  );
}

type MailResult = {
  domain: string;
  mx: { exchange: string; priority: number }[];
  spf: string[];
  dmarc: string[];
  dkim: { selector: string; records: string[] }[];
};

export function MailTool() {
  const [domain, setDomain] = useState("cloudflare.com");
  const [result, setResult] = useState<MailResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/mail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Lookup failed");
      setResult(payload as MailResult);
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
        <h1>Mail auth</h1>
        <p className="lede">MX plus SPF, DMARC, and a handful of common DKIM selectors — resolved here.</p>
      </header>
      <div className="workspace">
        <form className="panel" onSubmit={onSubmit}>
          <label className="field">
            <span>Domain</span>
            <input value={domain} onChange={(event) => setDomain(event.target.value)} />
          </label>
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn" disabled={busy}>
              {busy ? "Resolving…" : "Check mail auth"}
            </button>
          </div>
        </form>
        <section className="panel">
          {error && <p className="lede">{error}</p>}
          {result ? (
            <div className="stack">
              <div className="stat">
                <span>MX</span>
                <b className="wrap">
                  {result.mx.length
                    ? result.mx.map((item) => `${item.priority} ${item.exchange}`).join(" · ")
                    : "None"}
                </b>
              </div>
              <div className="stat">
                <span>SPF</span>
                <b className="wrap">{result.spf.join(" ") || "None"}</b>
              </div>
              <div className="stat">
                <span>DMARC</span>
                <b className="wrap">{result.dmarc.join(" ") || "None"}</b>
              </div>
              <div className="stat">
                <span>DKIM</span>
                <b className="wrap">
                  {result.dkim.length
                    ? result.dkim.map((item) => `${item.selector}: found`).join(" · ")
                    : "No common selectors found"}
                </b>
              </div>
            </div>
          ) : (
            !error && <p className="lede">MX, SPF, and DMARC land here.</p>
          )}
        </section>
      </div>
    </>
  );
}
