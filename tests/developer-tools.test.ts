import test from "node:test";
import assert from "node:assert/strict";
import { parse as parseYaml } from "yaml";
import { dockerRunToCompose, MAX_DOCKER_RUN_BYTES, tokenizeShellCommand, tokenizeShellCommandDetailed } from "../src/lib/dockerCompose.ts";
import { diffJsonText, formatJsonDiffValue } from "../src/lib/jsonDiff.ts";
import { buildEditableUrl, parseEditableUrl } from "../src/lib/urlInspector.ts";

type ComposeDocument = {
  services: Record<string, Record<string, unknown>>;
  networks?: Record<string, unknown>;
  volumes?: Record<string, unknown>;
};

test("docker escapes unquoted characters and preserves literal dollars through Compose", () => {
  const cases = [
    { argument: "FOO=\\$BAR", expected: "FOO=$$BAR" },
    { argument: '"FOO=\\$BAR"', expected: "FOO=$$BAR" },
    { argument: "'FOO=\\$BAR'", expected: "FOO=\\$$BAR" },
    { argument: "FOO=hello\\ world", expected: "FOO=hello world" },
  ];
  for (const { argument, expected } of cases) {
    const input = "docker run -e " + argument + " alpine";
    const result = dockerRunToCompose(input);
    const service = (parseYaml(result.yaml) as ComposeDocument).services.alpine;
    assert.deepEqual(service.environment, [expected], argument);
    const detailed = tokenizeShellCommandDetailed(input);
    assert.equal(detailed.variableReferenceCount, 0, argument);
    assert.equal(detailed.literalDollarCount, argument.includes("$") ? 1 : 0, argument);
  }
  const named = dockerRunToCompose("docker run --name web\\-app alpine");
  assert.equal((parseYaml(named.yaml) as ComposeDocument).services["web-app"].container_name, "web-app");
  assert.deepEqual(tokenizeShellCommand("docker run -e FOO=\\$BAR alpine"), ["docker", "run", "-e", "FOO=$BAR", "alpine"]);
});

test("docker run conversion preserves quoting, flags, command arguments, and external resources", () => {
  const input = `docker run -dit --rm \\
    --name web \\
    --env "GREETING=hello world" \\
    -e EMPTY= \\
    -p "127.0.0.1:8080:80/tcp" \\
    -v "web-data:/srv/data" \\
    --network frontend \\
    --restart unless-stopped \\
    --workdir /srv/app \\
    --user 1000:1000 \\
    --entrypoint "/bin/custom entrypoint" \\
    ghcr.io/acme/web:1.2 -c "echo hello world"`;
  const result = dockerRunToCompose(input);
  const document = parseYaml(result.yaml) as ComposeDocument;
  const service = document.services.web;

  assert.equal(service.image, "ghcr.io/acme/web:1.2");
  assert.equal(service.container_name, "web");
  assert.deepEqual(service.environment, ["GREETING=hello world", "EMPTY="]);
  assert.deepEqual(service.ports, ["127.0.0.1:8080:80/tcp"]);
  assert.deepEqual(service.volumes, ["web-data:/srv/data"]);
  assert.deepEqual(service.networks, ["frontend"]);
  assert.equal(service.restart, "unless-stopped");
  assert.equal(service.working_dir, "/srv/app");
  assert.equal(service.user, "1000:1000");
  assert.deepEqual(service.entrypoint, ["/bin/custom entrypoint"]);
  assert.equal(service.stdin_open, true);
  assert.equal(service.tty, true);
  assert.deepEqual(service.command, ["-c", "echo hello world"]);
  assert.deepEqual(document.networks, { frontend: { external: true } });
  assert.deepEqual(document.volumes, { "web-data": { external: true } });
  assert.equal(result.warnings.some((warning) => warning.includes("compose up -d")), true);
  assert.equal(result.warnings.some((warning) => warning.includes("compose run --rm")), true);
  assert.equal(result.warnings.some((warning) => warning.includes("create it")), true);
});

test("docker parser handles continuations, empty quoted args, attached short flags, and literal variables", () => {
  const command = "docker run `\n  -it `\n  -eHOME=$HOME `\n  -p8080:80 `\n  alpine sh -c \"\"";
  const result = dockerRunToCompose(command);
  const document = parseYaml(result.yaml) as ComposeDocument;
  const service = document.services.alpine;
  assert.deepEqual(service.environment, ["HOME=$HOME"]);
  assert.deepEqual(service.ports, ["8080:80"]);
  assert.deepEqual(service.command, ["sh", "-c", ""]);
  assert.equal(result.warnings.some((warning) => warning.includes("no values were read")), true);
  assert.deepEqual(tokenizeShellCommand("docker run -e GREETING=hello\\\nworld alpine"), [
    "docker", "run", "-e", "GREETING=helloworld", "alpine",
  ]);

  const priced = dockerRunToCompose("docker run -e PRICE='$5.00' alpine");
  const pricedService = (parseYaml(priced.yaml) as ComposeDocument).services.alpine;
  assert.deepEqual(pricedService.environment, ["PRICE=$$5.00"]);
  assert.equal(priced.warnings.some((warning) => warning.includes("Literal dollar")), true);
});

test("docker conversion rejects unsafe ambiguity, unsupported flags, malformed input, and oversized commands", () => {
  assert.throws(() => dockerRunToCompose("docker run --privileged alpine"), /Unsupported docker run flag: --privileged/);
  assert.throws(() => dockerRunToCompose("docker run -e TOKEN=$(whoami) alpine"), /substitutions are not supported/);
  assert.throws(() => dockerRunToCompose("docker run \"alpine"), /unclosed quote/);
  assert.throws(() => dockerRunToCompose("docker pull alpine"), /must use docker run/);
  assert.throws(() => dockerRunToCompose(`docker run alpine ${"x".repeat(MAX_DOCKER_RUN_BYTES)}`), /limit/);
});

test("structural JSON diff ignores object-key order and reports stable nested paths", () => {
  const equal = diffJsonText('{"a":1,"nested":{"x":2}}', '{"nested":{"x":2},"a":1}');
  assert.equal(equal.equal, true);
  assert.deepEqual(equal.changes, []);

  const result = diffJsonText(
    '{"user":{"name":"Ada"},"items":[1,2],"odd.key":true}',
    '{"items":[1,3,4],"odd.key":false,"user":{"name":"Grace"},"new":null}',
  );
  const changes = new Map(result.changes.map((change) => [change.path, change]));
  assert.equal(changes.get("$.user.name")?.kind, "changed");
  assert.equal(changes.get("$.items[1]")?.kind, "changed");
  assert.equal(changes.get("$.items[2]")?.kind, "added");
  assert.equal(changes.get('$["odd.key"]')?.kind, "changed");
  assert.equal(changes.get("$.new")?.kind, "added");
});

test("structural JSON diff labels syntax errors and enforces byte, depth, and change limits", () => {
  assert.throws(() => diffJsonText('{\n  "a": }', "{}"), /Before JSON/i);
  assert.throws(() => diffJsonText("{}", "["), /After JSON/i);
  assert.throws(() => diffJsonText('{"é":1}', "{}", { maxBytes: 5 }), /limit/);
  assert.throws(() => diffJsonText('[[[0]]]', '[[[0]]]', { maxDepth: 2 }), /nested more than 2 levels/);
  const limited = diffJsonText('{"a":1,"b":2}', '{"a":3,"b":4}', { maxChanges: 1 });
  assert.equal(limited.changes.length, 1);
  assert.equal(limited.truncated, true);
  const cyclic: { self?: unknown } = {};
  cyclic.self = cyclic;
  assert.match(formatJsonDiffValue(cyclic), /too deeply nested/);
});

test("URL inspector preserves duplicate query rows and percent-encoded credential and fragment meaning", () => {
  const source = "https://user:p%2540ss@example.com:8443/a%2Fb?tag=one&tag=two&empty=#a%2520b";
  const parts = parseEditableUrl(source);
  assert.equal(parts.username, "user");
  assert.equal(parts.password, "p%40ss");
  assert.equal(parts.pathname, "/a%2Fb");
  assert.equal(parts.fragment, "a%20b");
  assert.deepEqual(parts.query, [
    { name: "tag", value: "one" },
    { name: "tag", value: "two" },
    { name: "empty", value: "" },
  ]);

  const rebuilt = buildEditableUrl(parts);
  const reparsed = parseEditableUrl(rebuilt);
  assert.equal(reparsed.password, parts.password);
  assert.equal(reparsed.fragment, parts.fragment);
  assert.deepEqual(reparsed.query, parts.query);
});

test("URL inspector rebuilds edited components and rejects ambiguous host and port fields", () => {
  const parts = parseEditableUrl("example.com/path?a=1&a=2");
  const href = buildEditableUrl({
    ...parts,
    protocol: "http",
    hostname: "localhost",
    port: "3000",
    pathname: "/api/items",
    fragment: "section one",
    query: [{ name: "q", value: "a b" }, { name: "q", value: "c" }],
  });
  const url = new URL(href);
  assert.equal(url.origin, "http://localhost:3000");
  assert.equal(url.pathname, "/api/items");
  assert.equal(decodeURIComponent(url.hash.slice(1)), "section one");
  assert.deepEqual([...url.searchParams.entries()], [["q", "a b"], ["q", "c"]]);
  assert.throws(() => buildEditableUrl({ ...parts, hostname: "example.com/path" }), /valid hostname/);
  assert.throws(() => buildEditableUrl({ ...parts, hostname: "example.com?admin=true" }), /valid hostname/);
  assert.throws(() => buildEditableUrl({ ...parts, hostname: "example.com#fragment" }), /valid hostname/);
  assert.throws(() => buildEditableUrl({ ...parts, port: "70000" }), /1 to 65535/);
});
