import { useState } from "react";
import {
  Utility,
  ToolFrame,
  saveFile,
  type UtilityConfig,
} from "../../../components/Utility";
import { CopyButton } from "../../../components/CopyButton";
import {
  convertToml,
  formatSql,
  formatYaml,
  xmlAction,
} from "../../../lib/formatUtilities";
import { base64ToBytes, bytesToBase64 } from "../../../lib/utilityCore";

function Base64File() {
  const [text, setText] = useState("");
  const [mime, setMime] = useState("application/octet-stream");
  const [name, setName] = useState("decoded.bin");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function encode(file: File) {
    setError("");
    setBusy(true);
    try {
      if (file.size > 20 * 1024 * 1024)
        throw new Error("Choose a file up to 20 MiB.");
      const type = file.type || "application/octet-stream";
      setText(
        `data:${type};base64,${bytesToBase64(new Uint8Array(await file.arrayBuffer()))}`,
      );
      setMime(type);
      setName(file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read file.");
    } finally {
      setBusy(false);
    }
  }
  function decode() {
    try {
      const match = /^data:([^;,]*);base64,([\s\S]*)$/.exec(text);
      const bytes = base64ToBytes(match ? match[2] : text);
      // Always download; never navigate to or render the decoded content.
      saveFile(
        new Uint8Array(bytes),
        name.replace(/[/\\]/g, "_") || "decoded.bin",
        match?.[1] || mime,
      );
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not decode Base64.");
    }
  }
  return (
    <ToolFrame slug="base64-file">
      <div className="panel stack">
        <label className="field">
          <span>File to encode (up to 20 MiB)</span>
          <input
            type="file"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void encode(file);
              event.target.value = "";
            }}
          />
        </label>
        <label className="field">
          <span>Base64 or data URL</span>
          <textarea
            spellCheck={false}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setError("");
            }}
          />
        </label>
        <div className="row">
          <label className="field">
            <span>Download filename</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="field">
            <span>Media type</span>
            <input
              value={mime}
              onChange={(event) => setMime(event.target.value)}
            />
          </label>
        </div>
        <div className="row">
          <CopyButton text={text} />
          <button
            className="btn ghost"
            disabled={!text || busy}
            onClick={() => saveFile(text, "base64.txt")}
          >
            Save Base64
          </button>
          <button className="btn" disabled={!text || busy} onClick={decode}>
            Download decoded file
          </button>
        </div>
        {busy && <p role="status">Encoding…</p>}
        {error && <p role="alert">{error}</p>}
      </div>
    </ToolFrame>
  );
}
export default function FormatWorkbench({ slug }: { slug: string }) {
  if (slug === "base64-file") return <Base64File />;
  const configs: Record<string, UtilityConfig> = {
    toml: {
      fields: [
        {
          key: "input",
          label: "Source",
          value: 'title = "WebTools"\n[server]\nport = 8080',
          type: "textarea",
        },
        {
          key: "from",
          label: "From",
          value: "toml",
          options: ["toml", "json", "yaml"],
        },
        {
          key: "to",
          label: "To",
          value: "json",
          options: ["json", "yaml", "toml"],
        },
      ],
      run: (v) => convertToml(v.input, v.from, v.to),
      note: "Convert TOML, JSON, or YAML. TOML requires a root object and cannot represent null values. JSON encodes date values as strings.",
      filename: "converted.txt",
    },
    xml: {
      fields: [
        {
          key: "input",
          label: "Source",
          value: '<catalog><tool id="1">WebTools</tool></catalog>',
          type: "textarea",
        },
        {
          key: "mode",
          label: "Operation",
          value: "format",
          options: [
            ["format", "Format XML"],
            ["xml-json", "XML → JSON"],
            ["json-xml", "JSON → XML"],
          ],
        },
      ],
      run: (v) => xmlAction(v.input, v.mode),
      note: "Attributes use @_ prefixes and text uses #text in JSON. XML text values remain strings. XML-to-JSON cannot retain every ordering or mixed-content detail; formatting preserves ordered nodes. DTD declarations are unsupported.",
      filename: "converted.txt",
    },
    yaml: {
      fields: [
        {
          key: "input",
          label: "YAML",
          value: "name: WebTools\nports: [8080, 5173]",
          type: "textarea",
        },
      ],
      actions: ["Format"],
      run: (v) => formatYaml(v.input),
      note: "Validate and reserialize a single YAML document. Comments and original styling are removed; alias expansion is limited.",
      filename: "formatted.yaml",
    },
    sql: {
      fields: [
        {
          key: "input",
          label: "SQL query",
          value: "select id,name from users where active=true order by name",
          type: "textarea",
        },
        {
          key: "dialect",
          label: "Dialect",
          value: "postgresql",
          options: [
            "sql",
            "postgresql",
            "mysql",
            "sqlite",
            "mariadb",
            "transactsql",
            "bigquery",
            "snowflake",
            "plsql",
          ],
        },
      ],
      actions: ["Format"],
      run: (v) => formatSql(v.input, v.dialect),
      filename: "formatted.sql",
    },
  };
  return <Utility slug={slug} config={configs[slug]} />;
}
