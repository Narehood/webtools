export type UrlQueryParam = {
  name: string;
  value: string;
};

export type EditableUrl = {
  protocol: string;
  username: string;
  password: string;
  hostname: string;
  port: string;
  pathname: string;
  fragment: string;
  query: UrlQueryParam[];
};

export function parseEditableUrl(input: string): EditableUrl {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Paste a URL");
  let url: URL;
  try {
    url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    throw new Error("That does not look like a valid URL");
  }
  if (!url.hostname) throw new Error("The URL must include a hostname");

  return {
    protocol: url.protocol.slice(0, -1),
    username: decodeUrlComponent(url.username),
    password: decodeUrlComponent(url.password),
    hostname: url.hostname,
    port: url.port,
    pathname: url.pathname,
    fragment: decodeUrlComponent(url.hash.slice(1)),
    query: [...url.searchParams.entries()].map(([name, value]) => ({ name, value })),
  };
}

export function buildEditableUrl(parts: EditableUrl) {
  const protocol = parts.protocol.trim().replace(/:$/, "").toLowerCase();
  if (!/^[a-z][a-z0-9+.-]*$/.test(protocol)) throw new Error("Enter a valid URL scheme, such as https");
  const hostname = parts.hostname.trim();
  if (!hostname || /[\s/@\\?#]/.test(hostname)) throw new Error("Enter a valid hostname");
  const port = parts.port.trim();
  if (port) {
    const number = Number(port);
    if (!/^\d+$/.test(port) || !Number.isInteger(number) || number < 1 || number > 65535) {
      throw new Error("Port must be a whole number from 1 to 65535");
    }
  }

  const hostForUrl = hostname.includes(":") && !hostname.startsWith("[") ? `[${hostname}]` : hostname;
  let url: URL;
  try {
    url = new URL(`${protocol}://${hostForUrl}${port ? `:${port}` : ""}/`);
  } catch {
    throw new Error("Those URL components do not form a valid URL");
  }

  url.username = parts.username ? encodeURIComponent(parts.username) : "";
  url.password = parts.password ? encodeURIComponent(parts.password) : "";
  url.pathname = parts.pathname ? parts.pathname : "/";
  url.search = "";
  for (const param of parts.query) url.searchParams.append(param.name, param.value);
  url.hash = parts.fragment ? encodeURIComponent(parts.fragment) : "";
  return url.toString();
}

function decodeUrlComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
