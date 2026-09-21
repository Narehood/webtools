import { useState, type FormEvent } from "react";
import { CopyButton } from "../../components/CopyButton";
import { RecordList } from "../../components/RecordList";
import { whoisHighlights, whoisPlainText, whoisSections } from "../../lib/whoisView";

export function WhoisTool() {
  const [domain, setDomain] = useState("cloudflare.com");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const highlights = result ? whoisHighlights(result) : null;
  const sections = result ? whoisSections(result) : [];

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
      setResult((payload.result ?? {}) as Record<string, unknown>);
    } catch (err) {
      setResult(null);
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
          Queries WHOIS servers from this machine and lays the record out as labeled fields.
        </p>
      </header>
      <div className="workspace report">
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
          {error && <p className="lede" role="alert">{error}</p>}
          {highlights ? (
            <div className="stack">
              <div className="row">
                <h2>Record</h2>
                <CopyButton text={whoisPlainText(sections)} />
              </div>
              <div className="stat-grid">
                <Fact label="Domain" value={highlights.domain} />
                <Fact label="Registrar" value={highlights.registrar} />
                <Fact label="Created" value={highlights.created} />
                <Fact label="Expires" value={highlights.expires} />
                {highlights.updated ? <Fact label="Updated" value={highlights.updated} /> : null}
                {highlights.dnssec ? <Fact label="DNSSEC" value={highlights.dnssec} /> : null}
              </div>
              <RecordList title="Name servers" items={highlights.nameservers} empty="No name servers listed" />
              <RecordList title="Status" items={highlights.statuses} empty="No status listed" />
              {sections.map((section) => (
                <section key={section.title} className="record-block">
                  <h3>
                    {section.title}
                    <span>{section.rows.length}</span>
                  </h3>
                  {section.rows.length > 0 && (
                    <table className="meta-table">
                      <tbody>
                        {section.rows.map((row, index) => (
                          <tr key={`${row.label}-${index}`}>
                            <td>{row.label}</td>
                            <td>{row.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {section.raw && (
                    <details className="raw-fold">
                      <summary>Raw WHOIS text</summary>
                      <pre className="whois-block">{section.raw}</pre>
                    </details>
                  )}
                </section>
              ))}
            </div>
          ) : (
            !error && <p className="lede">Registrar, dates, name servers, and the rest of the record appear here.</p>
          )}
        </section>
      </div>
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <b className="wrap">{value || "—"}</b>
    </div>
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
  addresses?: { address: string; family: number }[];
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
      <div className="workspace report">
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
          {error && <p className="lede" role="alert">{error}</p>}
          {result ? (
            <div className="stack">
              <h2>{result.domain}</h2>
              <RecordList title="A" items={result.a} empty="No A records" />
              <RecordList title="AAAA" items={result.aaaa} empty="No AAAA records" />
              <RecordList title="CNAME" items={result.cname} empty="No CNAME" />
              <RecordList title="MX" items={result.mx.map((item) => `${item.priority}  ${item.exchange}`)} empty="No MX records" />
              <RecordList title="NS" items={result.ns} empty="No name servers" />
              <RecordList title="TXT" items={result.txt} empty="No TXT records" />
              {result.addresses && result.addresses.length > 0 && (
                <RecordList title="Resolver" items={result.addresses.map((item) => item.address)} />
              )}
            </div>
          ) : (
            !error && <p className="lede">A, AAAA, MX, NS, CNAME, and TXT land here.</p>
          )}
        </section>
      </div>
    </>
  );
}
