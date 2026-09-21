import { useState, type FormEvent } from "react";
import { RecordList } from "../../components/RecordList";

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
      <div className="workspace report">
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
          {error && <p className="lede" role="alert">{error}</p>}
          {result ? (
            <SslReport result={result} />
          ) : (
            !error && <p className="lede">Expiry, issuer, names, and fingerprint land here.</p>
          )}
        </section>
      </div>
    </>
  );
}

function formatCertDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function certNames(value: string) {
  return value.split(/,\s*/).map((item) => item.replace(/^[A-Za-z0-9.]+:/, "").trim()).filter(Boolean);
}

function SslReport({ result }: { result: SslResult }) {
  const rows = [
    ["Host", `${result.host}:${result.port}`],
    ["Protocol", result.protocol || "—"],
    ["Valid from", formatCertDate(result.validFrom)],
    ["Valid to", formatCertDate(result.validTo)],
    ["Days remaining", String(result.daysRemaining)],
    ["Serial", result.serialNumber],
    ["SHA-256", result.fingerprint256],
    ...Object.entries(result.subject).filter(([, value]) => value).map(([key, value]) => [`Subject ${key}`, value]),
    ...Object.entries(result.issuer).filter(([, value]) => value).map(([key, value]) => [`Issuer ${key}`, value]),
    ...(result.authorizationError ? [["Trust error", result.authorizationError]] : []),
  ];
  return (
    <div className="stack">
      <span className={`status-pill ${result.authorized && result.daysRemaining > 0 ? "up" : "down"}`}>
        {result.authorized ? "Trusted" : "Not trusted"} · {result.daysRemaining} days left
      </span>
      <div className="stat-grid">
        <div className="stat">
          <span>Issued to</span>
          <b className="wrap">{result.subject.CN || result.host}</b>
        </div>
        <div className="stat">
          <span>Issuer</span>
          <b className="wrap">{result.issuer.O || result.issuer.CN || "—"}</b>
        </div>
        <div className="stat">
          <span>Expires</span>
          <b className="wrap">{formatCertDate(result.validTo)}</b>
        </div>
        <div className="stat">
          <span>Protocol</span>
          <b>{result.protocol || "—"}</b>
        </div>
      </div>
      <table className="meta-table">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <td>{label}</td>
              <td>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <RecordList title="Subject alternative names" items={certNames(result.altNames)} empty="No names listed" />
    </div>
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
      <div className="workspace report">
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
          {error && <p className="lede" role="alert">{error}</p>}
          {chain.length ? (
            <div className="stack">
              {chain.map((hop, index) => (
                <article className="record-block" key={`${hop.url}-${index}`}>
                  <h3>
                    Hop {index + 1}
                    <span>{hop.status} {hop.statusText}</span>
                  </h3>
                  <p className="wrap">{hop.url}</p>
                  {hop.location && <p className="record-empty">Next: {hop.location}</p>}
                  <table className="meta-table">
                    <tbody>
                      {Object.entries(hop.headers).map(([name, value]) => (
                        <tr key={name}>
                          <td>{name}</td>
                          <td>{value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </article>
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
      <div className="workspace report">
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
          {error && <p className="lede" role="alert">{error}</p>}
          {result ? (
            <div className="stack">
              <h2>{result.domain}</h2>
              <RecordList
                title="MX"
                items={result.mx.map((item) => `${item.priority}  ${item.exchange}`)}
                empty="No MX records"
              />
              <RecordList title="SPF" items={result.spf} empty="No SPF record" />
              <RecordList title="DMARC" items={result.dmarc} empty="No DMARC record" />
              {result.dkim.length ? (
                result.dkim.map((item) => (
                  <RecordList key={item.selector} title={`DKIM · ${item.selector}`} items={item.records} empty="No record" />
                ))
              ) : (
                <RecordList title="DKIM" items={[]} empty="No common selectors found" />
              )}
            </div>
          ) : (
            !error && <p className="lede">MX, SPF, DMARC, and DKIM land here, one record per line.</p>
          )}
        </section>
      </div>
    </>
  );
}
