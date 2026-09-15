import { useMemo, useState } from "react";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { csvToJson, jsonToCsv } from "../../lib/text";
import { explainCron } from "../../lib/cron";
import { CopyButton } from "../../components/CopyButton";

export function DataTool() {
  const [mode, setMode] = useState<"csv-json" | "json-csv" | "yaml-json" | "json-yaml">("csv-json");
  const [input, setInput] = useState("name,role\nAda,Engineer\nGrace,Mathematician");
  const [error, setError] = useState("");
  const [output, setOutput] = useState("");

  function convert() {
    try {
      if (mode === "csv-json") setOutput(JSON.stringify(csvToJson(input), null, 2));
      else if (mode === "json-csv") setOutput(jsonToCsv(JSON.parse(input)));
      else if (mode === "yaml-json") setOutput(JSON.stringify(parseYaml(input), null, 2));
      else setOutput(stringifyYaml(JSON.parse(input)));
      setError("");
    } catch (err) {
      setOutput("");
      setError(err instanceof Error ? err.message : "Conversion failed");
    }
  }

  return (
    <>
      <header className="tool-head">
        <span className="badge local">On device</span>
        <h1>CSV / YAML / JSON</h1>
        <p className="lede">Move between tabular and config formats without a remote parser.</p>
      </header>
      <div className="workspace">
        <section className="panel">
          <label className="field">
            <span>Direction</span>
            <select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}>
              <option value="csv-json">CSV → JSON</option>
              <option value="json-csv">JSON → CSV</option>
              <option value="yaml-json">YAML → JSON</option>
              <option value="json-yaml">JSON → YAML</option>
            </select>
          </label>
          <label className="field" style={{ marginTop: 12 }}>
            <span>Input</span>
            <textarea value={input} onChange={(event) => setInput(event.target.value)} />
          </label>
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn" onClick={convert}>
              Convert
            </button>
          </div>
          {error && <p className="lede">{error}</p>}
        </section>
        <section className="panel">
          <label className="field">
            <span>Output</span>
            <textarea readOnly value={output} />
          </label>
          <div className="row" style={{ marginTop: 12 }}>
            <CopyButton text={output} />
          </div>
        </section>
      </div>
    </>
  );
}

export function RegexTool() {
  const [pattern, setPattern] = useState("\\b[A-Z][a-z]+\\b");
  const [flags, setFlags] = useState("g");
  const [sample, setSample] = useState("Ada and Grace built the everyday Bench.");
  const result = useMemo(() => {
    try {
      if (!pattern) return { ok: true as const, matches: [] as { text: string; index: number }[] };
      const safeFlags = flags.includes("g") ? flags : `${flags}g`;
      const regex = new RegExp(pattern, safeFlags);
      const matches = [...sample.matchAll(regex)]
        .slice(0, 200)
        .map((match) => ({ text: match[0], index: match.index ?? 0 }));
      return { ok: true as const, matches };
    } catch (error) {
      return { ok: false as const, message: error instanceof Error ? error.message : "Invalid regex" };
    }
  }, [pattern, flags, sample]);

  return (
    <>
      <header className="tool-head">
        <span className="badge local">On device</span>
        <h1>Regex tester</h1>
        <p className="lede">JavaScript regex, evaluated in this tab.</p>
      </header>
      <div className="workspace">
        <section className="panel">
          <label className="field">
            <span>Pattern</span>
            <input value={pattern} onChange={(event) => setPattern(event.target.value)} />
          </label>
          <label className="field" style={{ marginTop: 12 }}>
            <span>Flags</span>
            <input value={flags} onChange={(event) => setFlags(event.target.value)} />
          </label>
          <label className="field" style={{ marginTop: 12 }}>
            <span>Sample</span>
            <textarea value={sample} onChange={(event) => setSample(event.target.value)} />
          </label>
        </section>
        <section className="panel">
          {result.ok ? (
            result.matches.length ? (
              <div className="stack">
                {result.matches.map((match, index) => (
                  <div className="stat" key={`${match.index}-${index}`}>
                    <span>Index {match.index}</span>
                    <b className="wrap">{match.text}</b>
                  </div>
                ))}
              </div>
            ) : (
              <p className="lede">No matches.</p>
            )
          ) : (
            <p className="lede">{result.message}</p>
          )}
        </section>
      </div>
    </>
  );
}

export function CronTool() {
  const [expression, setExpression] = useState("*/15 9-17 * * 1-5");
  const result = useMemo(() => {
    try {
      return { ok: true as const, text: explainCron(expression) };
    } catch (error) {
      return { ok: false as const, text: error instanceof Error ? error.message : "Could not read cron" };
    }
  }, [expression]);

  return (
    <>
      <header className="tool-head">
        <span className="badge local">On device</span>
        <h1>Cron explainer</h1>
        <p className="lede">Five fields: minute, hour, day of month, month, day of week.</p>
      </header>
      <div className="workspace">
        <section className="panel">
          <label className="field">
            <span>Expression</span>
            <input value={expression} onChange={(event) => setExpression(event.target.value)} />
          </label>
        </section>
        <section className="panel paper">
          <h3>In English</h3>
          <p className="lede">{result.text}</p>
        </section>
      </div>
    </>
  );
}
