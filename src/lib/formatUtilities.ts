import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { XMLBuilder, XMLParser, XMLValidator } from "fast-xml-parser";
import { format, type SqlLanguage } from "sql-formatter";
import xmlFormat from "xml-formatter";
import { boundedText } from "./utilityCore.ts";

function validateRepresentable(
  value: unknown,
  format: string,
  path = "$",
  ancestors = new Set<object>(),
  depth = 0,
): void {
  if (depth > 64) throw new Error("The document is nested too deeply.");
  if (value === null && format === "toml")
    throw new Error(`TOML cannot represent null at ${path}.`);
  if (typeof value === "number" && !Number.isFinite(value) && format === "json")
    throw new Error(`JSON cannot represent a nonfinite number at ${path}.`);
  if (typeof value === "bigint" || typeof value === "undefined")
    throw new Error(`Unsupported value at ${path}.`);
  if (value && typeof value === "object") {
    if (ancestors.has(value))
      throw new Error("Circular aliases cannot be converted.");
    ancestors.add(value);
    if (!(value instanceof Date))
      for (const [key, child] of Object.entries(value))
        validateRepresentable(
          child,
          format,
          `${path}.${key}`,
          ancestors,
          depth + 1,
        );
    ancestors.delete(value);
  }
}

export function convertToml(input: string, from: string, to: string) {
  boundedText(input, 200_000);
  const value =
    from === "toml"
      ? parseToml(input)
      : from === "yaml"
        ? parseYaml(input, { maxAliasCount: 50 })
        : JSON.parse(input);
  validateRepresentable(value, to);
  if (to === "toml") {
    if (value === null || typeof value !== "object" || Array.isArray(value))
      throw new Error("TOML requires an object at the root.");
    return stringifyToml(value);
  }
  return to === "yaml" ? stringifyYaml(value) : JSON.stringify(value, null, 2);
}
function validateXml(input: string) {
  boundedText(input, 200_000);
  if (/<!DOCTYPE|<!ENTITY/i.test(input))
    throw new Error("DTD and custom entity declarations are not supported.");
  const valid = XMLValidator.validate(input);
  if (valid !== true)
    throw new Error(`XML line ${valid.err.line}: ${valid.err.msg}`);
}
export function xmlAction(input: string, mode: string) {
  if (mode === "json-xml") {
    const value = JSON.parse(boundedText(input, 200_000));
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("JSON must be an object with one root element.");
    if (Object.keys(value).length !== 1)
      throw new Error("XML requires exactly one root element.");
    const result = new XMLBuilder({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      format: false,
      suppressEmptyNode: true,
    }).build(value) as string;
    validateXml(result);
    return result;
  }
  validateXml(input);
  if (mode === "xml-json") {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      parseTagValue: false,
      parseAttributeValue: false,
      trimValues: false,
      processEntities: true,
    });
    return JSON.stringify(parser.parse(input), null, 2);
  }
  return xmlFormat(input, {
    indentation: "  ",
    collapseContent: true,
    lineSeparator: "\n",
    throwOnFailure: true,
  });
}
export function formatYaml(input: string) {
  return stringifyYaml(
    parseYaml(boundedText(input, 200_000), { maxAliasCount: 50 }),
  );
}
export function formatSql(input: string, dialect: string) {
  return format(boundedText(input, 100_000), {
    language: dialect as SqlLanguage,
    keywordCase: "upper",
    tabWidth: 2,
  });
}
