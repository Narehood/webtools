export type Inline =
  | { type: "text"; text: string }
  | { type: "strong"; text: string }
  | { type: "em"; text: string }
  | { type: "code"; text: string }
  | { type: "link"; text: string; href: string };

export type Block =
  | { type: "p"; inlines: Inline[] }
  | { type: "h"; level: number; inlines: Inline[] }
  | { type: "ul"; items: Inline[][] }
  | { type: "ol"; items: Inline[][] }
  | { type: "quote"; inlines: Inline[] }
  | { type: "code"; text: string }
  | { type: "hr" };

const inlinePattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\([^)\s]+\))/g;

export function safeHref(href: string) {
  return /^(https?:\/\/|mailto:)/i.test(href);
}

export function parseInline(input: string): Inline[] {
  const parts: Inline[] = [];
  let last = 0;
  for (const match of input.matchAll(inlinePattern)) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ type: "text", text: input.slice(last, index) });
    const token = match[0];
    if (token.startsWith("`")) parts.push({ type: "code", text: token.slice(1, -1) });
    else if (token.startsWith("**")) parts.push({ type: "strong", text: token.slice(2, -2) });
    else if (token.startsWith("*")) parts.push({ type: "em", text: token.slice(1, -1) });
    else {
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token);
      if (link && safeHref(link[2])) parts.push({ type: "link", text: link[1], href: link[2] });
      else parts.push({ type: "text", text: token });
    }
    last = index + token.length;
  }
  if (last < input.length) parts.push({ type: "text", text: input.slice(last) });
  return parts;
}

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    if (line.startsWith("```")) {
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) {
        body.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ type: "code", text: body.join("\n") });
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      blocks.push({ type: "hr" });
      index += 1;
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      blocks.push({ type: "h", level: heading[1].length, inlines: parseInline(heading[2]) });
      index += 1;
      continue;
    }
    if (line.startsWith(">")) {
      const body: string[] = [];
      while (index < lines.length && lines[index].startsWith(">")) {
        body.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push({ type: "quote", inlines: parseInline(body.join(" ")) });
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: Inline[][] = [];
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        items.push(parseInline(lines[index].replace(/^\s*[-*]\s+/, "")));
        index += 1;
      }
      blocks.push({ type: "ul", items });
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: Inline[][] = [];
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
        items.push(parseInline(lines[index].replace(/^\s*\d+\.\s+/, "")));
        index += 1;
      }
      blocks.push({ type: "ol", items });
      continue;
    }
    const paragraph: string[] = [];
    while (
      index < lines.length
      && lines[index].trim()
      && !/^(#{1,3}\s|>|```|\s*[-*]\s+|\s*\d+\.\s+)/.test(lines[index])
      && !/^(-{3,}|\*{3,})$/.test(lines[index].trim())
    ) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push({ type: "p", inlines: parseInline(paragraph.join(" ")) });
  }
  return blocks;
}
