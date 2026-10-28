import type { Tool } from "./tools";

export type ExtraGroup =
  | "crypto"
  | "formats"
  | "text"
  | "network"
  | "developer"
  | "browser"
  | "calculators"
  | "images"
  | "files";

const definitions: [string, string, string, ExtraGroup][] = [
  [
    "bcrypt",
    "Bcrypt",
    "Hash passwords and compare bcrypt hashes locally.",
    "crypto",
  ],
  [
    "ulid",
    "ULID generator",
    "Generate sortable identifiers and decode their timestamps.",
    "crypto",
  ],
  [
    "encryption",
    "Encrypt & decrypt",
    "Protect text with password-based AES-256-GCM encryption.",
    "crypto",
  ],
  [
    "bip39",
    "BIP39 mnemonic",
    "Generate and validate mnemonic phrases, entropy, and seeds.",
    "crypto",
  ],
  [
    "rsa",
    "RSA key pair",
    "Generate downloadable public and private PEM keys on this device.",
    "crypto",
  ],
  [
    "password-strength",
    "Password strength",
    "Estimate password guessability with local dictionary and pattern analysis.",
    "crypto",
  ],
  [
    "toml",
    "TOML / JSON / YAML",
    "Convert TOML, JSON, and YAML with validation.",
    "formats",
  ],
  [
    "xml",
    "XML / JSON & formatter",
    "Format XML or convert XML and JSON with explicit attribute handling.",
    "formats",
  ],
  [
    "yaml",
    "YAML formatter",
    "Validate and prettify YAML documents.",
    "formats",
  ],
  [
    "sql",
    "SQL formatter",
    "Format SQL queries for common database dialects.",
    "formats",
  ],
  [
    "base64-file",
    "Base64 file converter",
    "Encode a file as Base64 or download decoded bytes.",
    "formats",
  ],
  [
    "nato",
    "NATO alphabet",
    "Spell text using the NATO phonetic alphabet.",
    "text",
  ],
  [
    "binary",
    "Text & binary",
    "Convert UTF-8 text to binary bytes and back.",
    "text",
  ],
  [
    "unicode",
    "Text & Unicode",
    "Inspect code points and convert Unicode escape sequences.",
    "text",
  ],
  [
    "list",
    "List converter",
    "Split, sort, deduplicate, decorate, and join lists.",
    "text",
  ],
  [
    "email-normalizer",
    "Email normalizer",
    "Clean email lists with optional provider-specific alias normalization.",
    "text",
  ],
  [
    "obfuscate",
    "String obfuscator",
    "Mask the middle of text while keeping chosen edge characters.",
    "text",
  ],
  [
    "numeronym",
    "Numeronym generator",
    "Turn internationalization into i18n and other word abbreviations.",
    "text",
  ],
  [
    "ascii",
    "ASCII art text",
    "Draw banner text with a choice of FIGlet fonts.",
    "text",
  ],
  [
    "emoji",
    "Emoji picker",
    "Search emojis by name and copy characters or Unicode code points.",
    "text",
  ],
  [
    "ipv4",
    "IPv4 converter",
    "Convert dotted IPv4, decimal, binary, hexadecimal, and IPv6-mapped forms.",
    "network",
  ],
  [
    "ipv4-range",
    "IPv4 range",
    "Cover a range with exact CIDR blocks and inspect its enclosing subnet.",
    "network",
  ],
  [
    "mac-lookup",
    "MAC vendor lookup",
    "Look up IEEE vendor assignments using a bundled offline registry.",
    "network",
  ],
  [
    "mac-generator",
    "MAC address generator",
    "Generate random MAC addresses with prefix and formatting controls.",
    "network",
  ],
  [
    "ipv6-ula",
    "IPv6 ULA generator",
    "Create a random private /48 prefix and /64 subnet.",
    "network",
  ],
  [
    "random-port",
    "Random port generator",
    "Choose random unprivileged port numbers within a selected range.",
    "network",
  ],
  [
    "basic-auth",
    "Basic auth header",
    "Generate and decode an HTTP Basic Authorization header.",
    "developer",
  ],
  [
    "meta-tags",
    "Social meta tags",
    "Build escaped HTML metadata for search and social previews.",
    "developer",
  ],
  [
    "mime",
    "MIME types",
    "Find media types by filename or extension, and extensions by type.",
    "developer",
  ],
  [
    "user-agent",
    "User-agent parser",
    "Inspect browser, engine, OS, CPU, and device information locally.",
    "developer",
  ],
  [
    "http-codes",
    "HTTP status codes",
    "Search the HTTP status registry by code, name, or description.",
    "developer",
  ],
  [
    "safelink",
    "SafeLink decoder",
    "Extract original links from Microsoft Outlook Safe Links.",
    "developer",
  ],
  [
    "git-reference",
    "Git cheatsheet",
    "Search common Git commands and explanations.",
    "developer",
  ],
  [
    "regex-reference",
    "Regex cheatsheet",
    "Search JavaScript regex syntax and examples.",
    "developer",
  ],
  [
    "html-editor",
    "HTML editor",
    "Edit rich text and source with a sandboxed preview.",
    "developer",
  ],
  [
    "benchmark",
    "Benchmark builder",
    "Compare repeated task timings with summary statistics.",
    "developer",
  ],
  [
    "device",
    "Device information",
    "Inspect this browser, display, language, and platform.",
    "browser",
  ],
  [
    "keycode",
    "Keyboard inspector",
    "Press a key to see its key, code, location, and modifiers.",
    "browser",
  ],
  [
    "camera",
    "Camera recorder",
    "Take photos or record video with your camera, locally.",
    "browser",
  ],
  [
    "roman",
    "Roman numerals",
    "Convert canonical Roman numerals and integers from 1 to 3999.",
    "calculators",
  ],
  [
    "math",
    "Math evaluator",
    "Evaluate arithmetic, constants, and common math functions.",
    "calculators",
  ],
  [
    "eta",
    "ETA calculator",
    "Estimate remaining time and finish time from progress and speed.",
    "calculators",
  ],
  [
    "stopwatch",
    "Stopwatch",
    "Measure elapsed time and record laps.",
    "calculators",
  ],
  [
    "phone",
    "Phone parser",
    "Validate and format international phone numbers.",
    "calculators",
  ],
  [
    "iban",
    "IBAN validator",
    "Validate IBAN checksums and inspect country and account components.",
    "calculators",
  ],
  [
    "svg-placeholder",
    "SVG placeholder",
    "Create a downloadable SVG placeholder with custom size and colors.",
    "images",
  ],
  [
    "pdf-signature",
    "PDF signature checker",
    "Inspect PDF signatures and verify their cryptographic integrity locally.",
    "files",
  ],
];

const palette: Record<string, [string, string]> = {
  crypto: ["rgba(185,163,212,.16)", "#b9a3d4"],
  developer: ["rgba(134,179,199,.16)", "#86b3c7"],
  text: ["rgba(226,181,122,.16)", "#e2b57a"],
  network: ["rgba(143,190,154,.16)", "#8fbe9a"],
  calculators: ["rgba(185,163,212,.16)", "#b9a3d4"],
  images: ["rgba(226,181,122,.16)", "#e2b57a"],
  files: ["rgba(224,137,114,.16)", "#e08972"],
};

export const extraTools: (Tool & { group: ExtraGroup })[] = definitions.map(
  ([slug, name, blurb, group]) => {
    const category =
      group === "formats" || group === "browser" ? "developer" : group;
    const [tile, tileInk] = palette[category];
    return { slug, name, blurb, category, local: true, tile, tileInk, group };
  },
);
