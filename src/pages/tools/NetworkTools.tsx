import { useState, type FormEvent } from "react";

function pickString(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return "";
}

function pickList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string" && value) return [value];
  return [];
}

function flattenWhois(result: Record<string, unknown>) {
  const records = Object.values(result).filter(
    (item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item),
  );
  const merged: Record<string, unknown> = {};
  for (const record of records) Object.assign(merged, record);
  return {
    domain: pickString(merged["Domain Name"]) || pickString(merged.domain),
    registrar: pickString(merged.Registrar),
    created: pickString(merged["Created Date"]) || pickString(merged["Creation Date"]),
    expires: pickString(merged["Expiry Date"]) || pickString(merged["Registry Expiry Date"]),
    nameservers: pickList(merged["Name Server"]),
  };
}

export function WhoisTool() {
  const [domain, setDomain] = useState("cloudflare.com");
  const [summary, setSummary] = useState<ReturnType<typeof flattenWhois> | null>(null);
  const [raw, setRaw] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/whois", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "WHOIS failed");
      const result = payload.result as Record<string, unknown>;
      setSummary(flattenWhois(result));
      setRaw(JSON.stringify(result, null, 2));
    } catch (err) {
      setSummary(null);
      setRaw("");
      setError(err instanceof Error ? err.message : "WHOIS failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="tool-head">
        <span className="badge network">This server</span>
        <h1>WHOIS</h1>
        <p className="lede">
          Queries WHOIS servers from this machine — registrar, dates, and nameservers without a
          third-party lookup site.
        </p>
      </header>
      <div className="workspace">
        <form className="panel" onSubmit={onSubmit}>
          <label className="field">
            <span>Domain</span>
            <input value={domain} onChange={(event) => setDomain(event.target.value)} />
          </label>
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn" disabled={busy}>
              {busy ? "Querying…" : "Look up"}
            </button>
          </div>
        </form>
        <section className="panel">
          {error && <p className="lede">{error}</p>}
          {summary ? (
            <div className="stack">
              <div className="stat-grid">
                <div className="stat">
                  <span>Registrar</span>
                  <b>{summary.registrar || "—"}</b>
                </div>
                <div className="stat">
                  <span>Expires</span>
                  <b>{summary.expires ? summary.expires.slice(0, 10) : "—"}</b>
                </div>
              </div>
              <p className="lede" style={{ marginBottom: 0 }}>
                Created {summary.created ? summary.created.slice(0, 10) : "—"}
                <br />
                NS: {summary.nameservers.slice(0, 4).join(", ") || "—"}
              </p>
              <pre className="whois-block">{raw}</pre>
            </div>
          ) : (
            !error && <p className="lede">Registrar, dates, and nameservers appear here.</p>
          )}
        </section>
      </div>
    </>
  );
}

type DnsResult = {
  domain: string;
  a: string[];
  aaaa: string[];
  cname: string[];
  mx: { exchange: string; priority: number }[];
  ns: string[];
  txt: string[];
};

export function DnsTool() {
  const [domain, setDomain] = useState("example.com");
  const [result, setResult] = useState<DnsResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/dns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "DNS lookup failed");
      setResult(payload as DnsResult);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "DNS lookup failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="tool-head">
        <span className="badge network">This server</span>
        <h1>DNS lookup</h1>
        <p className="lede">Resolves records with the container’s DNS, not a public web API.</p>
      </header>
      <div className="workspace">
        <form className="panel" onSubmit={onSubmit}>
          <label className="field">
            <span>Hostname</span>
            <input value={domain} onChange={(event) => setDomain(event.target.value)} />
          </label>
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn" disabled={busy}>
              {busy ? "Resolving…" : "Resolve"}
            </button>
          </div>
        </form>
        <section className="panel">
          {error && <p className="lede">{error}</p>}
          {result ? (
            <pre className="whois-block">{JSON.stringify(result, null, 2)}</pre>
          ) : (
            <p className="lede">A, AAAA, MX, NS, CNAME, and TXT land here.</p>
          )}
        </section>
      </div>
    </>
  );
}
