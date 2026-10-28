import { stringify as stringifyYaml } from "yaml";

export type DockerComposeConversion = {
  yaml: string;
  warnings: string[];
};

export const MAX_DOCKER_RUN_BYTES = 100_000;

type RunOptions = {
  image: string;
  command: string[];
  environment: string[];
  ports: string[];
  volumes: string[];
  name?: string;
  network?: string;
  restart?: string;
  workdir?: string;
  user?: string;
  entrypoint?: string;
  detach: boolean;
  remove: boolean;
  tty: boolean;
  interactive: boolean;
};

type ComposeService = {
  image: string;
  container_name?: string;
  environment?: string[];
  ports?: string[];
  volumes?: string[];
  network_mode?: string;
  networks?: string[];
  restart?: string;
  working_dir?: string;
  user?: string;
  entrypoint?: string[];
  stdin_open?: boolean;
  tty?: boolean;
  command?: string[];
};

type ComposeDocument = {
  services: Record<string, ComposeService>;
  networks?: Record<string, { external: true }>;
  volumes?: Record<string, { external: true }>;
};

const VALUE_FLAGS = new Map<string, keyof Pick<RunOptions,
  "name" | "network" | "restart" | "workdir" | "user" | "entrypoint"
>>([
  ["--name", "name"],
  ["--network", "network"],
  ["--net", "network"],
  ["--restart", "restart"],
  ["--workdir", "workdir"],
  ["--user", "user"],
  ["--entrypoint", "entrypoint"],
]);

const REPEATED_FLAGS = new Map<string, keyof Pick<RunOptions, "environment" | "ports" | "volumes">>([
  ["--env", "environment"],
  ["--publish", "ports"],
  ["--volume", "volumes"],
]);

const SHORT_VALUE_FLAGS = new Map<string, keyof Pick<RunOptions,
  "environment" | "ports" | "volumes" | "workdir" | "user"
>>([
  ["e", "environment"],
  ["p", "ports"],
  ["v", "volumes"],
  ["w", "workdir"],
  ["u", "user"],
]);

/**
 * Convert one `docker run` command into a Compose document. This parser never
 * invokes a shell: quotes are read locally and substitutions are not evaluated.
 */
export function dockerRunToCompose(input: string): DockerComposeConversion {
  const inputBytes = new TextEncoder().encode(input).byteLength;
  if (inputBytes > MAX_DOCKER_RUN_BYTES) {
    throw new Error(`Docker command is ${inputBytes.toLocaleString()} bytes; the limit is ${MAX_DOCKER_RUN_BYTES.toLocaleString()} bytes`);
  }
  const raw = input.trim();
  if (!raw) throw new Error("Paste a docker run command");
  if (/\$\(|[<>]\(/.test(raw) || /`[^`\r\n]+`/.test(raw.replace(/`\r?\n/g, ""))) {
    throw new Error("Shell command and process substitutions are not supported; replace them with literal values");
  }

  const tokenized = tokenizeShellCommandDetailed(raw);
  const tokens = tokenized.tokens;
  let cursor = 0;
  if (tokens[cursor] === "sudo") cursor += 1;
  if (!/^docker(?:\.exe)?$/i.test(tokens[cursor] ?? "")) {
    throw new Error("The command must start with docker run");
  }
  cursor += 1;
  if (tokens[cursor] === "container" && tokens[cursor + 1] === "run") cursor += 2;
  else if (tokens[cursor] === "run") cursor += 1;
  else throw new Error("The command must use docker run");

  const options: RunOptions = {
    image: "",
    command: [],
    environment: [],
    ports: [],
    volumes: [],
    detach: false,
    remove: false,
    tty: false,
    interactive: false,
  };

  let optionsEnded = false;
  while (cursor < tokens.length && !options.image) {
    const token = tokens[cursor];
    if (token === "--") {
      optionsEnded = true;
      cursor += 1;
      continue;
    }
    if (!optionsEnded && token.startsWith("--")) {
      const equal = token.indexOf("=");
      const flag = equal < 0 ? token : token.slice(0, equal);
      const attached = equal < 0 ? undefined : token.slice(equal + 1);
      const repeatedKey = REPEATED_FLAGS.get(flag);
      if (repeatedKey) {
        const read = readFlagValue(flag, attached, tokens, cursor);
        options[repeatedKey].push(read.value);
        cursor = read.next;
        continue;
      }
      const valueKey = VALUE_FLAGS.get(flag);
      if (valueKey) {
        const read = readFlagValue(flag, attached, tokens, cursor);
        if (valueKey === "network" && options.network !== undefined) {
          throw new Error("Multiple --network values cannot be represented safely by this converter");
        }
        options[valueKey] = read.value;
        cursor = read.next;
        continue;
      }
      const booleanKey = longBooleanFlag(flag);
      if (booleanKey) {
        options[booleanKey] = parseBooleanFlag(flag, attached);
        cursor += 1;
        continue;
      }
      throw new Error(`Unsupported docker run flag: ${flag}`);
    }
    if (!optionsEnded && token.startsWith("-") && token !== "-") {
      cursor = readShortFlag(token, tokens, cursor, options);
      continue;
    }
    options.image = token;
    cursor += 1;
  }

  if (!options.image) throw new Error("The docker run command is missing an image");
  options.command = tokens.slice(cursor);

  const serviceName = makeServiceName(options.name ?? options.image);
  const service: ComposeService = { image: options.image };
  if (options.name) service.container_name = options.name;
  if (options.environment.length) service.environment = options.environment;
  if (options.ports.length) service.ports = options.ports;
  if (options.volumes.length) service.volumes = options.volumes;
  if (options.restart !== undefined) service.restart = options.restart;
  if (options.workdir !== undefined) service.working_dir = options.workdir;
  if (options.user !== undefined) service.user = options.user;
  if (options.entrypoint !== undefined) service.entrypoint = [options.entrypoint];
  if (options.interactive) service.stdin_open = true;
  if (options.tty) service.tty = true;
  if (options.command.length) service.command = options.command;

  const document: ComposeDocument = { services: { [serviceName]: service } };
  if (options.network) {
    if (["bridge", "host", "none"].includes(options.network) || options.network.startsWith("container:")) {
      service.network_mode = options.network;
    } else {
      service.networks = [options.network];
      document.networks = { [options.network]: { external: true } };
    }
  }

  const namedVolumes = [...new Set(options.volumes.map(namedVolumeSource).filter((name): name is string => Boolean(name)))];
  if (namedVolumes.length) {
    document.volumes = Object.fromEntries(namedVolumes.map((name) => [name, { external: true as const }]));
  }

  const warnings: string[] = [];
  if (options.detach) warnings.push("Detach is a Compose CLI choice; run `docker compose up -d` to keep that behavior.");
  if (options.remove) warnings.push("Auto-remove is not stored in a Compose service; use `docker compose run --rm` when appropriate.");
  if (namedVolumes.length) {
    warnings.push(`Named volume${namedVolumes.length === 1 ? "" : "s"} ${namedVolumes.join(", ")} marked external; create ${namedVolumes.length === 1 ? "it" : "them"} before starting Compose.`);
  }
  if (tokenized.literalDollarCount) {
    warnings.push("Literal dollar signs were escaped as `$$` so Compose passes them through unchanged.");
  }
  if (tokenized.variableReferenceCount || /%[A-Za-z_][A-Za-z0-9_]*%/.test(raw)) {
    warnings.push("Variable references were preserved for Compose; no values were read or expanded on this machine.");
  }

  return { yaml: stringifyYaml(document, { lineWidth: 0 }), warnings };
}

function longBooleanFlag(flag: string): "detach" | "remove" | "tty" | "interactive" | null {
  if (flag === "--detach") return "detach";
  if (flag === "--rm") return "remove";
  if (flag === "--tty") return "tty";
  if (flag === "--interactive") return "interactive";
  return null;
}

function parseBooleanFlag(flag: string, attached: string | undefined) {
  if (attached === undefined || attached === "true") return true;
  if (attached === "false") return false;
  throw new Error(`${flag} expects true or false when a value is supplied`);
}

function readFlagValue(flag: string, attached: string | undefined, tokens: string[], cursor: number) {
  if (attached !== undefined) {
    if (!attached) throw new Error(`${flag} needs a value`);
    return { value: attached, next: cursor + 1 };
  }
  const value = tokens[cursor + 1];
  if (value === undefined) throw new Error(`${flag} needs a value`);
  return { value, next: cursor + 2 };
}

function readShortFlag(token: string, tokens: string[], cursor: number, options: RunOptions) {
  const body = token.slice(1);
  if (body && [...body].every((flag) => "dit".includes(flag))) {
    for (const flag of body) {
      if (flag === "d") options.detach = true;
      else if (flag === "i") options.interactive = true;
      else options.tty = true;
    }
    return cursor + 1;
  }

  const flag = body.charAt(0);
  const key = SHORT_VALUE_FLAGS.get(flag);
  if (!key) throw new Error(`Unsupported docker run flag: -${flag || body}`);
  const attached = body.slice(1) || undefined;
  const read = readFlagValue(`-${flag}`, attached, tokens, cursor);
  if (key === "environment" || key === "ports" || key === "volumes") options[key].push(read.value);
  else options[key] = read.value;
  return read.next;
}

function makeServiceName(source: string) {
  const last = source.split("/").at(-1) ?? "app";
  const withoutDigest = last.replace(/@.*$/, "");
  const withoutTag = withoutDigest.replace(/:[^:]*$/, "");
  return withoutTag
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "") || "app";
}

function namedVolumeSource(volume: string) {
  if (/^[A-Za-z]:[\\/]/.test(volume)) return null;
  const separator = volume.indexOf(":");
  if (separator <= 0) return null;
  const source = volume.slice(0, separator);
  return /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(source) ? source : null;
}

type ShellTokenization = {
  tokens: string[];
  literalDollarCount: number;
  variableReferenceCount: number;
};

export function tokenizeShellCommand(input: string) {
  return tokenizeShell(input, false).tokens;
}

/** Tokenize without invoking a shell, and escape literal `$` as Compose `$$`. */
export function tokenizeShellCommandDetailed(input: string): ShellTokenization {
  return tokenizeShell(input, true);
}

function readDollar(source: string, index: number, escapeLiteral: boolean) {
  const rest = source.slice(index);
  if (rest.startsWith("${")) {
    let depth = 1;
    for (let offset = 2; offset < rest.length; offset += 1) {
      if (rest[offset] === "{") depth += 1;
      else if (rest[offset] === "}") {
        depth -= 1;
        if (depth === 0) {
          return { text: rest.slice(0, offset + 1), kind: "variable" as const, next: index + offset + 1 };
        }
      }
    }
  }
  const named = /^\$[A-Za-z_][A-Za-z0-9_]*/.exec(rest);
  if (named) return { text: named[0], kind: "variable" as const, next: index + named[0].length };
  if (/^\$[0-9?$#*@!\-]/.test(rest)) {
    return { text: rest.slice(0, 2), kind: "variable" as const, next: index + 2 };
  }
  return { text: escapeLiteral ? "$$" : "$", kind: "literal" as const, next: index + 1 };
}

function tokenizeShell(input: string, escapeLiteralDollars: boolean): ShellTokenization {
  const source = input.replace(/\\\r?\n/g, "").replace(/`\r?\n/g, "").replace(/\^\r?\n/g, "");
  const tokens: string[] = [];
  let token = "";
  let started = false;
  let quote: "'" | '"' | null = null;
  let literalDollarCount = 0;
  let variableReferenceCount = 0;

  const push = () => {
    if (!started) return;
    tokens.push(token);
    token = "";
    started = false;
  };

  const takeDollar = (index: number) => {
    if (quote === "'") {
      literalDollarCount += 1;
      token += escapeLiteralDollars ? "$$" : "$";
      return index;
    }
    const read = readDollar(source, index, escapeLiteralDollars);
    if (read.kind === "literal") literalDollarCount += 1;
    else variableReferenceCount += 1;
    token += read.text;
    return read.next - 1;
  };

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quote === "'") {
      if (char === "'") quote = null;
      else if (char === "$") index = takeDollar(index);
      else token += char;
      started = true;
      continue;
    }
    if (quote === '"') {
      if (char === '"') {
        quote = null;
      } else if (char === "\\") {
        const next = source[index + 1];
        if (next === '"' || next === "\\" || next === "`") {
          token += next;
          index += 1;
        } else if (next === "$") {
          literalDollarCount += 1;
          token += escapeLiteralDollars ? "$$" : "$";
          index += 1;
        } else {
          token += char;
        }
      } else if (char === "$") {
        index = takeDollar(index);
      } else {
        token += char;
      }
      started = true;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      started = true;
      continue;
    }
    if (/\s/.test(char)) {
      push();
      continue;
    }
    if (char === "#" && !started) {
      while (index + 1 < source.length && source[index + 1] !== "\n" && source[index + 1] !== "\r") index += 1;
      continue;
    }
    if (char === "\\") {
      const next = source[index + 1];
      if (next === undefined) throw new Error("The command ends with an unfinished escape");
      if (next === "$") {
        literalDollarCount += 1;
        token += escapeLiteralDollars ? "$$" : "$";
      } else {
        token += next;
      }
      index += 1;
      started = true;
      continue;
    }
    if (char === "$") {
      index = takeDollar(index);
      started = true;
      continue;
    }
    token += char;
    started = true;
  }

  if (quote) throw new Error("The command has an unclosed quote");
  push();
  return { tokens, literalDollarCount, variableReferenceCount };
}
