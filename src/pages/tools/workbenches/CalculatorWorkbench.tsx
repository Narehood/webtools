import { useEffect, useRef, useState } from "react";
import {
  parsePhoneNumberFromString,
  getCountries,
  type CountryCode,
} from "libphonenumber-js/max";
import {
  extractIBAN,
  friendlyFormatIBAN,
  isQRIBAN,
  validateIBAN,
  ValidationErrorsIBAN,
} from "ibantools";
import {
  Utility,
  ToolFrame,
  type UtilityConfig,
} from "../../../components/Utility";
import { CopyButton } from "../../../components/CopyButton";
import { fromRoman, toRoman } from "../../../lib/textUtilities";
import { evaluateMath } from "../../../lib/mathEvaluator";
import { finiteNumber } from "../../../lib/utilityCore";

function elapsedLabel(ms: number) {
  const centiseconds = Math.floor(ms / 10);
  return `${Math.floor(centiseconds / 360000)
    .toString()
    .padStart(
      2,
      "0",
    )}:${(Math.floor(centiseconds / 6000) % 60).toString().padStart(2, "0")}:${(Math.floor(centiseconds / 100) % 60).toString().padStart(2, "0")}.${(centiseconds % 100).toString().padStart(2, "0")}`;
}
function Stopwatch() {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [laps, setLaps] = useState<number[]>([]);
  const accumulated = useRef(0),
    started = useRef(0);
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(
      () =>
        setElapsed(accumulated.current + performance.now() - started.current),
      30,
    );
    return () => window.clearInterval(id);
  }, [running]);
  const current = () =>
    accumulated.current + (running ? performance.now() - started.current : 0);
  function toggle() {
    if (running) {
      accumulated.current = current();
      setElapsed(accumulated.current);
    } else {
      started.current = performance.now();
    }
    setRunning(!running);
  }
  function reset() {
    setRunning(false);
    accumulated.current = 0;
    setElapsed(0);
    setLaps([]);
  }
  return (
    <ToolFrame
      slug="stopwatch"
      note="A monotonic timer with pause, resume, and laps. Leaving this page resets it; background tabs may refresh the display less often."
    >
      <section className="panel stack">
        <output className="stopwatch-display" aria-label="Elapsed time">
          {elapsedLabel(elapsed)}
        </output>
        <div className="row">
          <button className="btn" onClick={toggle}>
            {running ? "Pause" : "Start"}
          </button>
          <button
            className="btn ghost"
            disabled={!running || laps.length >= 1000}
            onClick={() => setLaps((previous) => [...previous, current()])}
          >
            Lap
          </button>
          <button className="btn ghost" onClick={reset}>
            Reset
          </button>
          <CopyButton
            text={laps
              .map(
                (lap, index) =>
                  `Lap ${index + 1}: ${elapsedLabel(lap)} (+${elapsedLabel(lap - (laps[index - 1] ?? 0))})`,
              )
              .join("\n")}
          />
        </div>
        <ol className="lap-list">
          {laps.map((lap, index) => (
            <li key={index}>
              <span>Lap {index + 1}</span>
              <code>{elapsedLabel(lap)}</code>
              <code>+{elapsedLabel(lap - (laps[index - 1] ?? 0))}</code>
            </li>
          ))}
        </ol>
      </section>
    </ToolFrame>
  );
}
function eta(values: Record<string, string>) {
  const total = finiteNumber(values.total, 0, "Total units"),
    done = finiteNumber(values.done, 0, "Completed units"),
    rate = finiteNumber(values.rate, Number.MIN_VALUE, "Units per second");
  if (done > total) throw new Error("Completed units cannot exceed the total.");
  const seconds = (total - done) / rate;
  const end = new Date(Date.now() + seconds * 1000);
  if (!Number.isFinite(seconds) || Number.isNaN(end.getTime()))
    throw new Error(
      "The estimated finish is outside the supported date range.",
    );
  return `Progress: ${total ? ((done / total) * 100).toFixed(2) : "100"}%\nRemaining units: ${total - done}\nRemaining seconds: ${Number(seconds.toFixed(3))}\nRemaining duration: ${Math.floor(seconds / 86400)} days, ${Math.floor(seconds / 3600) % 24} hours, ${Math.floor(seconds / 60) % 60} minutes, ${Math.floor(seconds) % 60} seconds\nEstimated finish (local): ${end.toLocaleString()}\nEstimated finish (UTC): ${end.toISOString()}\n\nAssumes a constant rate from the moment you calculate.`;
}
function phone(raw: string, country: string) {
  if (raw.length > 200) throw new Error("Phone input is too long.");
  const parsed = parsePhoneNumberFromString(raw, {
    defaultCountry: country as CountryCode,
    extract: false,
  });
  if (!parsed)
    throw new Error(
      "The phone number could not be parsed. Choose a default country or include + and a country calling code.",
    );
  return JSON.stringify(
    {
      valid: parsed.isValid(),
      possible: parsed.isPossible(),
      country: parsed.country ?? "Not uniquely determined",
      callingCode: parsed.countryCallingCode,
      type: parsed.getType() ?? "Unknown",
      e164: parsed.number,
      international: parsed.formatInternational(),
      national: parsed.formatNational(),
      extension: parsed.ext ?? null,
      uri: parsed.getURI(),
    },
    null,
    2,
  );
}
function iban(raw: string) {
  if (raw.length > 100) throw new Error("IBAN input is too long.");
  const electronic = raw.replace(/\s/g, "").toUpperCase();
  const result = validateIBAN(electronic);
  return JSON.stringify(
    {
      ...extractIBAN(electronic),
      formatted: friendlyFormatIBAN(electronic),
      qrIban: result.valid ? isQRIBAN(electronic) : false,
      errors: result.errorCodes.map((code) => ValidationErrorsIBAN[code]),
    },
    null,
    2,
  );
}
export default function CalculatorWorkbench({ slug }: { slug: string }) {
  if (slug === "stopwatch") return <Stopwatch />;
  const countries = getCountries()
    .map(
      (code) =>
        [
          code,
          `${new Intl.DisplayNames(["en"], { type: "region" }).of(code)} (${code})`,
        ] as const,
    )
    .sort((a, b) => a[1].localeCompare(b[1]));
  const configs: Record<string, UtilityConfig> = {
    roman: {
      fields: [
        { key: "input", label: "Number or Roman numeral", value: "2026" },
      ],
      actions: ["To Roman", "To number"],
      run: (v, a) => (a === "To Roman" ? toRoman(v.input) : fromRoman(v.input)),
    },
    math: {
      fields: [
        {
          key: "input",
          label: "Expression",
          value: "sqrt(144) + 2^3 * sin(pi/2)",
          type: "textarea",
        },
      ],
      actions: ["Evaluate"],
      run: (v) => String(evaluateMath(v.input)),
      note: "Arithmetic: + − * / % ^ **, parentheses, pi, e. Functions: sin, cos, tan, asin, acos, atan, sqrt, cbrt, abs, exp, ln, log (base 10), floor, ceil, round, min, max, pow. Angles are radians; multiplication must be explicit. Uses JavaScript floating-point numbers.",
    },
    eta: {
      fields: [
        { key: "total", label: "Total units", value: "1000", type: "number" },
        { key: "done", label: "Completed units", value: "250", type: "number" },
        { key: "rate", label: "Units per second", value: "10", type: "number" },
      ],
      actions: ["Estimate"],
      run: (v) => eta(v),
      note: "Choose any consistent unit (files, bytes, records). Enter progress and a rate in those units per second to estimate the remaining duration.",
    },
    phone: {
      fields: [
        { key: "input", label: "Phone number", value: "+1 202 555 0123" },
        {
          key: "country",
          label: "Default country for national numbers",
          value: "US",
          options: countries,
        },
      ],
      actions: ["Parse"],
      run: (v) => phone(v.input, v.country),
      note: "Parse and format using bundled libphonenumber metadata. A valid format does not establish that a number is assigned or reachable.",
    },
    iban: {
      fields: [
        { key: "input", label: "IBAN", value: "GB82 WEST 1234 5698 7654 32" },
      ],
      actions: ["Validate"],
      run: (v) => iban(v.input),
      note: "Check the country format and checksum locally. A valid checksum does not establish account existence or ownership.",
    },
  };
  return <Utility slug={slug} config={configs[slug]} />;
}
