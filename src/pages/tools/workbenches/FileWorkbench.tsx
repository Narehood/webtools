import { useState } from "react";
import { ToolFrame } from "../../../components/Utility";
import { CopyButton } from "../../../components/CopyButton";
import { inspectPdfSignatures } from "../../../lib/pdfSignatures";

export default function FileWorkbench({ slug }: { slug: string }) {
  const [report, setReport] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function inspect(file: File) {
    setReport("");
    setError("");
    setBusy(true);
    try {
      if (file.size > 30 * 1024 * 1024)
        throw new Error("Choose a PDF up to 30 MiB.");
      const result = await inspectPdfSignatures(
        new Uint8Array(await file.arrayBuffer()),
      );
      setReport(
        result.signatures.length
          ? JSON.stringify(result, null, 2)
          : `No signature dictionaries were found in the parsed PDF.\n\n${result.note}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not inspect PDF.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <ToolFrame
      slug={slug}
      note="Inspect PDF signature dictionaries and verify detached CMS signatures against the original bytes. Certificate trust and revocation are not checked. Later unsigned revisions are reported separately. The file stays in this tab."
    >
      <section className="panel stack">
        <label className="field">
          <span>PDF (up to 30 MiB)</span>
          <input
            type="file"
            accept="application/pdf,.pdf"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void inspect(file);
              event.target.value = "";
            }}
          />
        </label>
        {busy && <p role="status">Checking signatures…</p>}
        {error && <p role="alert">{error}</p>}
        <label className="field">
          <span>Signature report</span>
          <textarea className="utility-output" readOnly value={report} />
        </label>
        <CopyButton text={report} />
      </section>
    </ToolFrame>
  );
}
