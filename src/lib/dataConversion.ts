import { csvToJson, jsonToCsv } from "./text.ts";
import { convertToml } from "./structuredConversion.ts";
import { parseJsonSafely } from "./safeJson.ts";
import { boundedText } from "./utilityCore.ts";

export type DataConversionMode = "csv-json" | "json-csv" | "yaml-json" | "json-yaml";

export function convertData(input: string, mode: DataConversionMode) {
  boundedText(input, 200_000);
  if (mode === "csv-json") return JSON.stringify(csvToJson(input), null, 2);
  if (mode === "json-csv") return jsonToCsv(parseJsonSafely(input));
  return mode === "yaml-json" ? convertToml(input, "yaml", "json") : convertToml(input, "json", "yaml");
}
