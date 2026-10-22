import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { XMLBuilder, XMLParser, XMLValidator } from "fast-xml-parser";
import { format, type SqlLanguage } from "sql-formatter";
import xmlFormat from "xml-formatter";
import { boundedText } from "./utilityCore.ts";
import { parseJsonSafely } from "./safeJson.ts";

export { convertToml } from "./structuredConversion.ts";

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
    const value = parseJsonSafely(boundedText(input, 200_000));
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
    parseYaml(boundedText(input, 200_000), { maxAliasCount: 50, intAsBigInt: true }),
  );
}
export function formatSql(input: string, dialect: string) {
  return format(boundedText(input, 100_000), {
    language: dialect as SqlLanguage,
    keywordCase: "upper",
    tabWidth: 2,
  });
}
