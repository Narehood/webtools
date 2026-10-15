import { Utility, type UtilityConfig } from "../../../components/Utility";
import {
  generateMacs,
  generateUla,
  ipv4Range,
  ipv4Representations,
  normalizeMac,
  randomPorts,
} from "../../../lib/networkUtilities";

type MacRegistry = {
  updated: string;
  entries: Record<string, string>;
  sources: string[];
};
let registry: Promise<MacRegistry> | undefined;
async function lookup(raw: string) {
  const mac = normalizeMac(raw);
  const first = parseInt(mac.slice(0, 2), 16);
  if (first & 1)
    return "Multicast/group address. A vendor cannot be inferred from this address.";
  if (first & 2)
    return "Locally administered address. Its prefix does not reliably identify a manufacturer.";
  registry ??= fetch("/data/mac-vendors.json")
    .then((response) => {
      if (!response.ok)
        throw new Error("Could not load the bundled IEEE registry.");
      return response.json() as Promise<MacRegistry>;
    })
    .catch((error) => {
      registry = undefined;
      throw error;
    });
  const data = await registry;
  const prefix = [9, 7, 6]
    .map((length) => mac.slice(0, length))
    .find((key) => Object.hasOwn(data.entries, key));
  return `MAC: ${mac.match(/../g)!.join(":")}\nVendor: ${prefix ? data.entries[prefix] : "No IEEE assignment found in this snapshot."}\n${prefix ? `Assignment: ${prefix}/${prefix.length * 4}\n` : ""}Registry snapshot: ${data.updated}\n\nVendor lookup identifies the registered prefix owner, not a specific device. MAC addresses can be changed. Lookup runs locally; the address is not sent to another service.`;
}
export default function NetworkWorkbench({ slug }: { slug: string }) {
  const configs: Record<string, UtilityConfig> = {
    ipv4: {
      fields: [
        { key: "input", label: "IPv4 address or number", value: "192.168.1.1" },
        {
          key: "format",
          label: "Input format",
          value: "dotted",
          options: [
            ["dotted", "Dotted decimal"],
            ["decimal", "Decimal integer"],
            ["hex", "Hexadecimal"],
            ["binary", "Binary"],
          ],
        },
      ],
      run: (v) =>
        Object.entries(ipv4Representations(v.input, v.format))
          .map(([key, value]) => `${key}: ${value}`)
          .join("\n"),
    },
    "ipv4-range": {
      fields: [
        { key: "start", label: "First IPv4 address", value: "192.168.1.10" },
        { key: "end", label: "Last IPv4 address", value: "192.168.1.200" },
      ],
      run: (v) => {
        const result = ipv4Range(v.start, v.end);
        return `Addresses: ${result.total.toLocaleString()}\nSmallest enclosing subnet: ${result.enclosing}\n(The enclosing subnet may contain extra addresses.)\n\nExact CIDR cover:\n${result.blocks.join("\n")}`;
      },
    },
    "mac-lookup": {
      fields: [
        { key: "input", label: "MAC address", value: "00:00:0C:12:34:56" },
      ],
      actions: ["Look up"],
      run: (v) => lookup(v.input),
    },
    "mac-generator": {
      fields: [
        {
          key: "prefix",
          label: "Optional prefix (up to five bytes)",
          value: "",
        },
        { key: "count", label: "Count", value: "5", type: "number" },
        {
          key: "style",
          label: "Format",
          value: "upper",
          options: [
            ["upper", "AA:BB:CC:DD:EE:FF"],
            ["lower", "aa:bb:cc:dd:ee:ff"],
            ["dash", "aa-bb-cc-dd-ee-ff"],
            ["dot", "aabb.ccdd.eeff"],
          ],
        },
        {
          key: "local",
          label:
            "Use locally administered addresses when no prefix is supplied",
          value: "true",
          type: "checkbox",
        },
      ],
      actions: ["Generate"],
      run: (v) => generateMacs(v.prefix, v.count, v.style, v.local === "true"),
      filename: "mac-addresses.txt",
    },
    "ipv6-ula": {
      fields: [{ key: "subnet", label: "Subnet ID (hexadecimal)", value: "1" }],
      actions: ["Generate"],
      run: (v) => generateUla(v.subnet),
    },
    "random-port": {
      fields: [
        { key: "min", label: "Minimum port", value: "49152", type: "number" },
        { key: "max", label: "Maximum port", value: "65535", type: "number" },
        { key: "count", label: "Count", value: "5", type: "number" },
      ],
      actions: ["Generate"],
      run: (v) => randomPorts(v.min, v.max, v.count),
      note: "Pick unique unprivileged ports with cryptographic randomness. This does not test whether a port is available or reserved by a service.",
    },
  };
  return <Utility slug={slug} config={configs[slug]} />;
}
