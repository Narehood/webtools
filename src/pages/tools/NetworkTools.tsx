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

type PublicResolverId = "cloudflare" | "google" | "quad9";

type DnsAddressAnswer = {
  status: "ok" | "absent" | "error";
  records: { address: string; ttl: number }[];
  error?: string;
};

type DnsResolverAnswer = {
  id: "local" | PublicResolverId;
  name: string;
  servers: string[];
  a: DnsAddressAnswer;
  aaaa: DnsAddressAnswer;
};

type DnsComparison = {
  domain: string;
  resolvers: DnsResolverAnswer[];
};

const PUBLIC_RESOLVERS: { id: PublicResolverId; label: string }[] = [
  { id: "cloudflare", label: "Cloudflare" },
  { id: "google", label: "Google" },
  { id: "quad9", label: "Quad9" },
];

async function postDns<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "DNS lookup failed");
  return payload;
}

function completedAddressSet(answer: DnsAddressAnswer) {
  if (answer.status === "error") return null;
  return [...new Set(answer.records.map((record) => record.address))].sort().join("\n");
}

function comparisonNotice(comparison: DnsComparison) {
  const types: ("a" | "aaaa")[] = ["a", "aaaa"];
  const different = types.some((type) => {
    const sets = comparison.resolvers
      .map((resolver) => completedAddressSet(resolver[type]))
      .filter((value): value is string => value !== null);
    return sets.length > 1 && new Set(sets).size > 1;
  });
  if (different) return "Address sets differ across resolvers. Geo-aware and split DNS can make this normal.";
  const comparable = types.some((type) => comparison.resolvers.filter((resolver) => resolver[type].status !== "error").length > 1);
  return comparable
    ? "Completed resolvers returned matching address sets (TTL and order ignored)."
    : "Not enough completed resolver answers to compare address sets.";
}

function DnsAddressRecords({ title, answer }: { title: string; answer: DnsAddressAnswer }) {
  if (answer.status === "error") {
    return <RecordList title={title} items={[`Lookup failed: ${answer.error || "DNS query failed"}`]} />;
  }
  return (
    <RecordList
      title={title}
      items={answer.records.map((record) => `${record.address} · TTL ${record.ttl}s`)}
      empty={`No ${title} records (valid empty answer)`}
    />
  );
}

export function DnsTool() {
  const [domain, setDomain] = useState("example.com");
  const [result, setResult] = useState<DnsResult | null>(null);
  const [comparison, setComparison] = useState<DnsComparison | null>(null);
  const [selectedResolvers, setSelectedResolvers] = useState<PublicResolverId[]>(PUBLIC_RESOLVERS.map((resolver) => resolver.id));
  const [error, setError] = useState("");
  const [comparisonError, setComparisonError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setComparisonError("");
    setResult(null);
    setComparison(null);

    const [recordsResult, comparisonResult] = await Promise.allSettled([
      postDns<DnsResult>("/api/dns", { domain }),
      postDns<DnsComparison>("/api/dns-compare", { domain, resolvers: selectedResolvers }),
    ]);
    if (recordsResult.status === "fulfilled") setResult(recordsResult.value);
    else setError(recordsResult.reason instanceof Error ? recordsResult.reason.message : "DNS lookup failed");
    if (comparisonResult.status === "fulfilled") setComparison(comparisonResult.value);
    else setComparisonError(comparisonResult.reason instanceof Error ? comparisonResult.reason.message : "Resolver comparison failed");
    setBusy(false);
  }

  function toggleResolver(id: PublicResolverId) {
    setSelectedResolvers((current) => current.includes(id)
      ? current.filter((resolver) => resolver !== id)
      : [...current, id]);
  }

  const comparisonSummary = comparison ? comparisonNotice(comparison) : "";

  return (
    <>
      <header className="tool-head">
        <span className="badge network">This server</span>
        <h1>DNS lookup</h1>
        <p className="lede">
          Resolves the full record set locally, then compares A and AAAA address answers with selected public resolvers.
        </p>
      </header>
      <div className="workspace report">
        <form className="panel" onSubmit={onSubmit}>
          <label className="field">
            <span>Hostname</span>
            <input value={domain} onChange={(event) => setDomain(event.target.value)} />
          </label>
          <fieldset className="panel" style={{ marginTop: 16 }}>
            <legend>Public address resolvers</legend>
            <p className="record-empty">The local resolver is always included. Comparison is limited to A and AAAA records.</p>
            <div className="stack">
              {PUBLIC_RESOLVERS.map((resolver) => (
                <label className="row" key={resolver.id}>
                  <input
                    type="checkbox"
                    checked={selectedResolvers.includes(resolver.id)}
                    onChange={() => toggleResolver(resolver.id)}
                  />
                  {resolver.label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn" disabled={busy}>
              {busy ? "Resolving…" : "Resolve and compare"}
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
          <div className="stack" style={{ marginTop: 20 }}>
            <h2>Address resolver comparison</h2>
            {comparisonError ? <p className="lede" role="alert">{comparisonError}</p> : null}
            {comparison ? (
              <>
                <p className="lede">{comparisonSummary}</p>
                {comparison.resolvers.map((resolver) => (
                  <article className="record-block" key={resolver.id}>
                    <h3>
                      {resolver.name}
                      <span>{resolver.servers.length ? resolver.servers.join(", ") : "system default"}</span>
                    </h3>
                    <DnsAddressRecords title="A" answer={resolver.a} />
                    <DnsAddressRecords title="AAAA" answer={resolver.aaaa} />
                  </article>
                ))}
              </>
            ) : !comparisonError ? (
              <p className="record-empty">Address answers, TTLs, valid empty answers, and per-query failures appear here.</p>
            ) : null}
          </div>
        </section>
      </div>
    </>
  );
}
