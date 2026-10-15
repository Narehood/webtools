import { useState } from "react";
import {
  Utility,
  ToolFrame,
  saveFile,
  type UtilityConfig,
} from "../../../components/Utility";
import { CopyButton } from "../../../components/CopyButton";
import {
  bcryptAction,
  bip39Action,
  decodeUlid,
  decryptText,
  encryptText,
  makeUlid,
  rsaKeyPair,
} from "../../../lib/cryptoUtilities";
import { integer } from "../../../lib/utilityCore";

function RsaTool() {
  const [bits, setBits] = useState("3072");
  const [pair, setPair] = useState<{
    publicKey: string;
    privateKey: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function generate() {
    setPair(null);
    setError("");
    setBusy(true);
    try {
      setPair(await rsaKeyPair(bits));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate keys.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <ToolFrame
      slug="rsa"
      note="Generate RSA keys locally, exported as PKCS#8 private and SPKI public PEM files. Requires HTTPS or localhost."
    >
      <div className="panel stack">
        <label className="field">
          <span>Key size</span>
          <select
            disabled={busy}
            value={bits}
            onChange={(event) => {
              setBits(event.target.value);
              setPair(null);
            }}
          >
            {[2048, 3072, 4096].map((size) => (
              <option key={size}>{size}</option>
            ))}
          </select>
        </label>
        <div>
          <button
            className="btn"
            disabled={busy}
            onClick={() => void generate()}
          >
            {busy ? "Generating…" : "Generate key pair"}
          </button>
        </div>
        {error && <p role="alert">{error}</p>}
        {pair && (
          <div className="workspace">
            {(
              [
                ["publicKey", "Public key", "public.pem"],
                ["privateKey", "Private key", "private.pem"],
              ] as const
            ).map(([key, label, filename]) => (
              <section className="stack" key={key}>
                <label className="field">
                  <span>{label}</span>
                  <textarea readOnly value={pair[key]} />
                </label>
                <div className="row">
                  <CopyButton text={pair[key]} />
                  <button
                    className="btn ghost"
                    onClick={() => saveFile(pair[key], filename)}
                  >
                    Download PEM
                  </button>
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </ToolFrame>
  );
}

async function strength(password: string) {
  if (password.length > 256)
    throw new Error("Use at most 256 characters for this estimate.");
  if (!password) throw new Error("Enter a password.");
  const [{ ZxcvbnFactory }, common, en] = await Promise.all([
    import("@zxcvbn-ts/core"),
    import("@zxcvbn-ts/language-common"),
    import("@zxcvbn-ts/language-en"),
  ]);
  const estimator = new ZxcvbnFactory({
    translations: en.translations,
    graphs: common.adjacencyGraphs,
    dictionary: { ...common.dictionary, ...en.dictionary },
  });
  const result = estimator.check(password);
  return `Score: ${result.score} / 4\nEstimated guesses: ${result.guesses.toLocaleString()}\n\n${result.feedback.warning ?? ""}\n${result.feedback.suggestions.join("\n")}\n\nCrack-time estimates (assumed attack rates):\n${Object.entries(
    result.crackTimes,
  )
    .map(
      ([key, value]) =>
        `${key} (${value.base} guesses/time unit): ${value.display}`,
    )
    .join(
      "\n",
    )}\n\nEstimates depend on attacker assumptions. This tool does not check breach databases.`;
}

export default function CryptoWorkbench({ slug }: { slug: string }) {
  if (slug === "rsa") return <RsaTool />;
  const configs: Record<string, UtilityConfig> = {
    bcrypt: {
      fields: [
        { key: "password", label: "Password", value: "", type: "password" },
        {
          key: "cost",
          label: "Work factor (4–14)",
          value: "10",
          type: "number",
        },
        {
          key: "hash",
          label: "Existing bcrypt hash (for comparison)",
          value: "",
          type: "textarea",
        },
      ],
      actions: ["Hash", "Compare"],
      run: (v, action) =>
        bcryptAction(v.password, v.cost, v.hash.trim(), action === "Compare"),
    },
    ulid: {
      fields: [
        { key: "count", label: "How many", value: "5", type: "number" },
        { key: "ulid", label: "ULID to inspect", value: "" },
      ],
      actions: ["Generate", "Decode timestamp"],
      run: (v, action) =>
        action === "Generate"
          ? Array.from({ length: integer(v.count, 1, 1000, "Count") }, () =>
              makeUlid(),
            ).join("\n")
          : decodeUlid(v.ulid),
      filename: "ulids.txt",
    },
    encryption: {
      fields: [
        {
          key: "input",
          label: "Text or WebTools encrypted JSON",
          value: "",
          type: "textarea",
        },
        { key: "password", label: "Password", value: "", type: "password" },
      ],
      actions: ["Encrypt", "Decrypt"],
      run: (v, action) =>
        action === "Encrypt"
          ? encryptText(v.input, v.password)
          : decryptText(v.input, v.password),
      note: "AES-256-GCM with a fresh salt and nonce, and PBKDF2-SHA256 (600,000 iterations). Keep the full encrypted JSON to decrypt it later. Uses the WebTools message format.",
      filename: "encrypted-message.txt",
    },
    bip39: {
      fields: [
        {
          key: "input",
          label: "Mnemonic or entropy (hex)",
          value: "",
          type: "textarea",
        },
        {
          key: "strength",
          label: "Entropy bits",
          value: "128",
          options: ["128", "160", "192", "224", "256"],
        },
        {
          key: "passphrase",
          label: "Optional seed passphrase",
          value: "",
          type: "password",
        },
      ],
      actions: ["Generate", "Validate & derive seed", "From entropy"],
      run: (v, action) =>
        bip39Action(v.input, v.passphrase, v.strength, action),
      note: "Generate English BIP39 mnemonics or validate their checksum. Derive a 64-byte seed from a phrase and optional passphrase. Everything stays in this tab.",
    },
    "password-strength": {
      fields: [
        {
          key: "password",
          label: "Password to analyze",
          value: "",
          type: "password",
        },
      ],
      actions: ["Analyze"],
      run: (v) => strength(v.password),
    },
  };
  return <Utility slug={slug} config={configs[slug]} />;
}
