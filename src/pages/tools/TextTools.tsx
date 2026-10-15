import { Fragment, useMemo, useRef, useState } from "react";
import { CopyButton } from "../../components/CopyButton";
import { cleanUrl } from "../../lib/url";
import { diffLines } from "../../lib/diff";
import { diffJsonText, formatJsonDiffValue } from "../../lib/jsonDiff";
import { casesOf, toSlug } from "../../lib/text";
import { parseTimestamp, type TimestampUnit } from "../../lib/timestamp";
import { buildEditableUrl, parseEditableUrl, type EditableUrl } from "../../lib/urlInspector";
import { generateIdentifiers } from "../../lib/identifiers";

const SAMPLE_URL = "https://example.com/article?utm_source=news&utm_medium=email&fbclid=IwAR123&id=42&id=84";

type UrlEditorParts = Omit<EditableUrl, "query"> & {
  query: (EditableUrl["query"][number] & { id: number })[];
};

export function UrlTool() {
  const [mode, setMode] = useState<"clean" | "inspect">("clean");

  return (
    <>
      <header className="tool-head">
        <span className="badge local">On device</span>
        <h1>URL cleaner & inspector</h1>
        <p className="lede">Remove tracking tags, or edit each URL component and duplicate query parameter in place.</p>
      </header>
      <div className="segment" role="group" aria-label="URL tool mode" style={{ marginBottom: 16 }}>
        <button type="button" aria-pressed={mode === "clean"} onClick={() => setMode("clean")}>Cleaner</button>
        <button type="button" aria-pressed={mode === "inspect"} onClick={() => setMode("inspect")}>Inspector</button>
      </div>
      <div hidden={mode !== "clean"}><UrlCleaner /></div>
      <div hidden={mode !== "inspect"}><UrlInspector /></div>
    </>
  );
}

function UrlInspector() {
  const nextQueryId = useRef(1);
  const [input, setInput] = useState(SAMPLE_URL);
  const [inputError, setInputError] = useState("");
  const [parts, setParts] = useState<UrlEditorParts>(() => {
    const parsed = parseEditableUrl(SAMPLE_URL);
    return { ...parsed, query: parsed.query.map((param) => ({ ...param, id: nextQueryId.current++ })) };
  });
  const rebuilt = useMemo(() => {
    try {
      return { ok: true as const, href: buildEditableUrl(parts) };
    } catch (error) {
      return { ok: false as const, message: error instanceof Error ? error.message : "Could not build the URL" };
    }
  }, [parts]);

  function inspect() {
    try {
      const parsed = parseEditableUrl(input);
      setParts({ ...parsed, query: parsed.query.map((param) => ({ ...param, id: nextQueryId.current++ })) });
      setInputError("");
    } catch (error) {
      setInputError(error instanceof Error ? error.message : "Could not inspect the URL");
    }
  }

  function updateQuery(id: number, field: "name" | "value", value: string) {
    setParts((current) => ({
      ...current,
      query: current.query.map((param) => param.id === id ? { ...param, [field]: value } : param),
    }));
  }

  return (
    <div className="workspace">
      <section className="panel stack">
        <label className="field">
          <span>URL to inspect</span>
          <textarea value={input} onChange={(event) => setInput(event.target.value)} />
        </label>
        <div className="row">
          <button className="btn" type="button" onClick={inspect}>Inspect URL</button>
        </div>
        {inputError && <p className="lede" role="alert" style={{ marginBottom: 0 }}>{inputError}</p>}
        <h2>Components</h2>
        <div className="stat-grid">
          <label className="field">
            <span>Scheme</span>
            <input value={parts.protocol} onChange={(event) => setParts({ ...parts, protocol: event.target.value })} spellCheck={false} />
          </label>
          <label className="field">
            <span>Hostname</span>
            <input value={parts.hostname} onChange={(event) => setParts({ ...parts, hostname: event.target.value })} spellCheck={false} />
          </label>
          <label className="field">
            <span>Port</span>
            <input value={parts.port} onChange={(event) => setParts({ ...parts, port: event.target.value })} inputMode="numeric" />
          </label>
          <label className="field">
            <span>Path</span>
            <input value={parts.pathname} onChange={(event) => setParts({ ...parts, pathname: event.target.value })} spellCheck={false} />
          </label>
          <label className="field">
            <span>Username</span>
            <input value={parts.username} onChange={(event) => setParts({ ...parts, username: event.target.value })} autoComplete="off" />
          </label>
          <label className="field">
            <span>Password</span>
            <input value={parts.password} onChange={(event) => setParts({ ...parts, password: event.target.value })} autoComplete="off" />
          </label>
          <label className="field">
            <span>Fragment</span>
            <input value={parts.fragment} onChange={(event) => setParts({ ...parts, fragment: event.target.value })} spellCheck={false} />
          </label>
        </div>
        <div className="row">
          <h2>Query parameters</h2>
          <button
            className="btn ghost"
            type="button"
            onClick={() => setParts((current) => ({
              ...current,
              query: [...current.query, { id: nextQueryId.current++, name: "", value: "" }],
            }))}
          >
            Add parameter
          </button>
        </div>
        {parts.query.length ? (
          <div className="stack">
            {parts.query.map((param) => (
              <div className="row" key={param.id}>
                <label className="field" style={{ flex: "1 1 140px" }}>
                  <span>Name</span>
                  <input value={param.name} onChange={(event) => updateQuery(param.id, "name", event.target.value)} spellCheck={false} />
                </label>
                <label className="field" style={{ flex: "1 1 180px" }}>
                  <span>Value</span>
                  <input value={param.value} onChange={(event) => updateQuery(param.id, "value", event.target.value)} spellCheck={false} />
                </label>
                <button
                  className="btn ghost"
                  type="button"
                  aria-label={`Delete query parameter ${param.name || "with no name"}`}
                  onClick={() => setParts((current) => ({
                    ...current,
                    query: current.query.filter((item) => item.id !== param.id),
                  }))}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="lede" style={{ marginBottom: 0 }}>No query parameters.</p>
        )}
      </section>
      <section className="panel">
        {rebuilt.ok ? (
          <div className="stack">
            <label className="field">
              <span>Rebuilt URL</span>
              <textarea readOnly value={rebuilt.href} />
            </label>
            <div className="row">
              <CopyButton text={rebuilt.href} />
            </div>
            <p className="lede" style={{ marginBottom: 0 }}>
              Query rows stay in this order, including duplicate names.
            </p>
          </div>
        ) : (
          <p className="lede" role="alert">{rebuilt.message}</p>
        )}
      </section>
    </div>
  );
}

function UrlCleaner() {
  const [input, setInput] = useState(
    "https://example.com/article?utm_source=news&utm_medium=email&fbclid=IwAR123&id=42",
  );
  const result = useMemo(() => {
    try {
      return { ok: true as const, ...cleanUrl(input) };
    } catch (error) {
      return { ok: false as const, message: error instanceof Error ? error.message : "Could not clean" };
    }
  }, [input]);

  return (
    <>
      <div className="workspace">
        <section className="panel">
          <label className="field">
            <span>Dirty URL</span>
            <textarea value={input} onChange={(event) => setInput(event.target.value)} />
          </label>
        </section>
        <section className="panel">
          {result.ok ? (
            <div className="stack">
              <label className="field">
                <span>Clean URL</span>
                <textarea readOnly value={result.href} />
              </label>
              <div className="row">
                <CopyButton text={result.href} />
              </div>
              <p className="lede" style={{ marginBottom: 0 }}>
                Removed {result.removed.length ? result.removed.join(", ") : "nothing — already clean"}.
              </p>
            </div>
          ) : (
            <p className="lede">{result.message}</p>
          )}
        </section>
      </div>
    </>
  );
}

export function DiffTool() {
  const [mode, setMode] = useState<"lines" | "json">("lines");

  return (
    <>
      <header className="tool-head">
        <span className="badge local">On device</span>
        <h1>Text & JSON diff</h1>
        <p className="lede">Compare lines, or compare JSON by structure while ignoring object-key order.</p>
      </header>
      <div className="segment" role="group" aria-label="Diff mode" style={{ marginBottom: 16 }}>
        <button type="button" aria-pressed={mode === "lines"} onClick={() => setMode("lines")}>Lines</button>
        <button type="button" aria-pressed={mode === "json"} onClick={() => setMode("json")}>JSON structure</button>
      </div>
      <div hidden={mode !== "lines"}><LineDiff /></div>
      <div hidden={mode !== "json"}><JsonStructureDiff /></div>
    </>
  );
}

function JsonStructureDiff() {
  const [before, setBefore] = useState('{\n  "name": "WebTools",\n  "ports": [80, 443],\n  "enabled": true\n}');
  const [after, setAfter] = useState('{\n  "enabled": true,\n  "name": "WebTools",\n  "ports": [8080, 443],\n  "owner": "home"\n}');
  const result = useMemo(() => {
    try {
      return { ok: true as const, ...diffJsonText(before, after) };
    } catch (error) {
      return { ok: false as const, message: error instanceof Error ? error.message : "Could not compare JSON" };
    }
  }, [before, after]);

  return (
    <div className="workspace">
      <section className="panel">
        <label className="field">
          <span>Before JSON</span>
          <textarea value={before} onChange={(event) => setBefore(event.target.value)} spellCheck={false} />
        </label>
        <label className="field" style={{ marginTop: 12 }}>
          <span>After JSON</span>
          <textarea value={after} onChange={(event) => setAfter(event.target.value)} spellCheck={false} />
        </label>
      </section>
      <section className="panel">
        {!result.ok ? (
          <p className="lede" role="alert">{result.message}</p>
        ) : result.equal ? (
          <p className="lede" role="status">No structural changes. Object-key order is ignored.</p>
        ) : (
          <div className="stack">
            <p className="lede" style={{ marginBottom: 0 }}>
              {result.changes.length} change{result.changes.length === 1 ? "" : "s"}
              {result.truncated ? " shown before the safety limit" : ""}. Array positions remain significant.
            </p>
            <div className="diff-list">
              {result.changes.map((change) => (
                <Fragment key={`${change.kind}-${change.path}`}>
                  {change.kind !== "added" && (
                    <div className="diff-line del">
                      <span>−</span>
                      {change.path}: {formatJsonDiffValue(change.before)}
                    </div>
                  )}
                  {change.kind !== "removed" && (
                    <div className="diff-line add">
                      <span>+</span>
                      {change.path}: {formatJsonDiffValue(change.after)}
                    </div>
                  )}
                </Fragment>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function LineDiff() {
  const [left, setLeft] = useState("The toolbox is quiet.\nLeave the originals on disk.");
  const [right, setRight] = useState("The toolbox is yours.\nLeave the originals on disk.");
  const rows = useMemo(() => diffLines(left, right), [left, right]);

  return (
    <>
      <div className="workspace">
        <section className="panel">
          <label className="field">
            <span>Before</span>
            <textarea value={left} onChange={(event) => setLeft(event.target.value)} />
          </label>
          <label className="field" style={{ marginTop: 12 }}>
            <span>After</span>
            <textarea value={right} onChange={(event) => setRight(event.target.value)} />
          </label>
        </section>
        <section className="panel">
          <div className="diff-list">
            {rows.map((row, index) => (
              <div key={`${row.type}-${index}`} className={`diff-line ${row.type}`}>
                <span>{row.type === "add" ? "+" : row.type === "del" ? "−" : "·"}</span>
                {row.text || " "}
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

export function IdsTool() {
  const [title, setTitle] = useState("Everyday toolbox notes");
  const [ids, setIds] = useState(() => generateIdentifiers("4", "5", "", ""));
  const [kind, setKind] = useState("4");
  const [count, setCount] = useState("5");
  const [name, setName] = useState("example.com");
  const [namespace, setNamespace] = useState("6ba7b810-9dad-11d1-80b4-00c04fd430c8");
  const [error, setError] = useState("");

  return (
    <>
      <header className="tool-head">
        <span className="badge local">On device</span>
        <h1>UUID & slug</h1>
          <p className="lede">UUID versions 1, 3, 4, 5, 6, and 7, short random IDs, and URL slugs. Name-based versions produce one deterministic ID per name and namespace.</p>
      </header>
      <div className="workspace">
        <section className="panel">
          <label className="field">
            <span>Title to slug</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
            <div className="stack" style={{ marginTop: 12 }}><label className="field"><span>ID type</span><select value={kind} onChange={event => { setKind(event.target.value); setIds([]); }}>{["1","3","4","5","6","7"].map(value => <option key={value} value={value}>UUID v{value}</option>)}<option value="nano">Short random ID</option></select></label><label className="field"><span>Count (random/time-based IDs)</span><input type="number" min="1" max="1000" value={count} onChange={event => setCount(event.target.value)} /></label>{["3","5"].includes(kind) && <><label className="field"><span>Namespace UUID (default: DNS)</span><input value={namespace} onChange={event => setNamespace(event.target.value)} /></label><label className="field"><span>Name</span><input value={name} onChange={event => setName(event.target.value)} /></label></>}</div>
          <div className="row" style={{ marginTop: 16 }}>
            <button
              className="btn"
                onClick={() => { try { setIds(generateIdentifiers(kind,count,name,namespace)); setError(""); } catch (err) { setIds([]); setError(err instanceof Error ? err.message : "Could not generate IDs."); } }}
            >
              New IDs
            </button>
              <CopyButton text={ids.join("\n")} />
          </div>
            {error && <p className="lede" role="alert">{error}</p>}
        </section>
        <section className="panel">
          <div className="stack">
            <div className="stat">
              <span>Slug</span>
              <b className="wrap">{toSlug(title) || "—"}</b>
            </div>
            {ids.map((id) => (
              <div className="stat" key={id}>
                <span>ID</span>
                <b className="wrap">{id}</b>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

export function TimestampTool() {
  const now = Date.now();
  const [raw, setRaw] = useState(String(Math.floor(now / 1000)));
  const [unit, setUnit] = useState<TimestampUnit>("seconds");
  const result = useMemo(() => {
    try { return { date: parseTimestamp(raw, unit), error: "" }; }
    catch (err) { return { date: null, error: err instanceof Error ? err.message : "Could not parse timestamp" }; }
  }, [raw, unit]);
  const parsed = result.date;

  return (
    <>
      <header className="tool-head">
        <span className="badge local">On device</span>
        <h1>Timestamp</h1>
        <p className="lede">Unix seconds, milliseconds, or an ISO string — converted on this clock.</p>
      </header>
      <div className="workspace">
        <section className="panel">
          <label className="field" style={{ marginBottom: 12 }}>
            <span>Input format</span>
            <select value={unit} onChange={(event) => setUnit(event.target.value as TimestampUnit)}>
              <option value="seconds">Unix seconds</option>
              <option value="milliseconds">Unix milliseconds</option>
              <option value="iso">ISO date-time</option>
            </select>
          </label>
          <label className="field">
            <span>Unix or ISO</span>
            <input value={raw} onChange={(event) => setRaw(event.target.value)} />
          </label>
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn" onClick={() => setRaw(unit === "iso" ? new Date().toISOString() : String(unit === "milliseconds" ? Date.now() : Math.floor(Date.now() / 1000)))}>
              Use now
            </button>
          </div>
        </section>
        <section className="panel">
          {parsed ? (
            <div className="stat-grid">
              <div className="stat">
                <span>Local</span>
                <b>{parsed.toLocaleString()}</b>
              </div>
              <div className="stat">
                <span>ISO</span>
                <b className="wrap">{parsed.toISOString()}</b>
              </div>
              <div className="stat">
                <span>Seconds</span>
                <b>{Math.floor(parsed.getTime() / 1000)}</b>
              </div>
              <div className="stat">
                <span>Milliseconds</span>
                <b>{parsed.getTime()}</b>
              </div>
            </div>
          ) : (
            <p role="alert" className="lede">{result.error}</p>
          )}
        </section>
      </div>
    </>
  );
}

export function CaseTool() {
  const [input, setInput] = useState("The everyday toolbox");
  const out = casesOf(input);

  return (
    <>
      <header className="tool-head">
        <span className="badge local">On device</span>
        <h1>Case converter</h1>
        <p className="lede">One paste, every common identifier style.</p>
      </header>
      <div className="workspace">
        <section className="panel">
          <label className="field">
            <span>Input</span>
            <textarea value={input} onChange={(event) => setInput(event.target.value)} />
          </label>
        </section>
        <section className="panel">
          <div className="stack">
            {Object.entries(out).map(([name, value]) => (
              <div className="stat" key={name}>
                <span>{name}</span>
                <b className="wrap">{value || "—"}</b>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
