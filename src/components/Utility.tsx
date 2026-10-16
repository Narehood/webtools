import { useState, type ReactNode } from "react";
import { CopyButton } from "./CopyButton";
import { getTool } from "../data/tools";

export function ToolFrame({
  slug,
  children,
  note,
}: {
  slug: string;
  children: ReactNode;
  note?: string;
}) {
  const tool = getTool(slug);
  return (
    <>
      <header className="tool-head">
        <span className="badge local">On device</span>
        <h1>{tool?.name}</h1>
        <p className="lede">{note ?? tool?.blurb}</p>
      </header>
      {children}
    </>
  );
}

export function saveFile(
  content: BlobPart,
  name: string,
  type = "text/plain;charset=utf-8",
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type UtilityField = {
  key: string;
  label: string;
  value: string;
  type?: "text" | "textarea" | "password" | "number" | "color" | "checkbox";
  options?: readonly (string | readonly [string, string])[];
};
export type Values = Record<string, string>;
export type UtilityConfig = {
  fields: UtilityField[];
  run: (values: Values, action: string) => string | Promise<string>;
  actions?: string[];
  note?: string;
  filename?: string;
};

export function Utility({
  slug,
  config,
}: {
  slug: string;
  config: UtilityConfig;
}) {
  const [values, setValues] = useState<Values>(() =>
    Object.fromEntries(config.fields.map((field) => [field.key, field.value])),
  );
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function run(action: string) {
    setBusy(true);
    setOutput("");
    setError("");
    try {
      setOutput(await config.run(values, action));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not process this input.",
      );
    } finally {
      setBusy(false);
    }
  }
  function update(key: string, value: string) {
    setValues((previous) => ({ ...previous, [key]: value }));
    setOutput("");
    setError("");
  }
  return (
    <ToolFrame slug={slug} note={config.note}>
      <div className="workspace utility-workspace">
        <section className="panel stack">
          <fieldset disabled={busy} className="utility-fields stack">
            {config.fields.map((field) => (
              <label
                className={field.type === "checkbox" ? "check" : "field"}
                key={field.key}
              >
                {field.type !== "checkbox" && <span>{field.label}</span>}
                {field.options ? (
                  <select
                    value={values[field.key]}
                    onChange={(event) => update(field.key, event.target.value)}
                  >
                    {field.options.map((option) => {
                      const [value, label] =
                        typeof option === "string" ? [option, option] : option;
                      return (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      );
                    })}
                  </select>
                ) : field.type === "textarea" ? (
                  <textarea
                    spellCheck={false}
                    value={values[field.key]}
                    onChange={(event) => update(field.key, event.target.value)}
                  />
                ) : field.type === "checkbox" ? (
                  <>
                    <input
                      type="checkbox"
                      checked={values[field.key] === "true"}
                      onChange={(event) =>
                        update(field.key, String(event.target.checked))
                      }
                    />
                    {field.label}
                  </>
                ) : (
                  <input
                    type={field.type ?? "text"}
                    autoComplete={
                      field.type === "password" ? "new-password" : "off"
                    }
                    value={values[field.key]}
                    onChange={(event) => update(field.key, event.target.value)}
                  />
                )}
              </label>
            ))}
            <div className="row">
              {(config.actions ?? ["Convert"]).map((action, index) => (
                <button
                  type="button"
                  className={`btn${index ? " ghost" : ""}`}
                  key={action}
                  onClick={() => void run(action)}
                >
                  {busy ? "Working…" : action}
                </button>
              ))}
            </div>
          </fieldset>
          {error && (
            <p role="alert" className="lede">
              {error}
            </p>
          )}
        </section>
        <section className="panel stack">
          <label className="field">
            <span>Output</span>
            <textarea
              className="utility-output"
              readOnly
              value={output}
              spellCheck={false}
            />
          </label>
          <div className="row">
            <CopyButton text={output} />
            {config.filename && (
              <button
                className="btn ghost"
                disabled={!output || busy}
                onClick={() => saveFile(output, config.filename!)}
              >
                Download
              </button>
            )}
          </div>
        </section>
      </div>
    </ToolFrame>
  );
}
