import test from "node:test";
import assert from "node:assert/strict";
import { checkStatus, traceHeaders } from "../server/api.ts";
import { createHealthRedirectGuard } from "../server/httpRedirects.ts";
import { summarizeDomainHealth } from "../server/networkTools.ts";

const checkedAt = "2026-10-15T12:00:00.000Z";
const target = { domain: "example.com", url: "https://example.com/" };

test("TLS health uses the expiry timestamp at the report time, including partial days", () => {
  const rejected = { status: "rejected", reason: new Error("not part of this test") } as const;
  for (const { validTo, daysRemaining, authorized, state, summary } of [
    { validTo: "2026-10-15T11:00:00Z", daysRemaining: 0, authorized: true, state: "notice", summary: /expired less than a day ago/ },
    { validTo: checkedAt, daysRemaining: 0, authorized: true, state: "notice", summary: /expired/ },
    { validTo: "2026-10-15T13:00:00Z", daysRemaining: 0, authorized: true, state: "ok", summary: /0 days remaining/ },
    { validTo: "2026-10-14T12:00:00Z", daysRemaining: -1, authorized: true, state: "notice", summary: /expired 1 days ago/ },
    { validTo: "invalid", daysRemaining: NaN, authorized: true, state: "notice", summary: /expiry unavailable/ },
    { validTo: "2026-10-16T12:00:00Z", daysRemaining: 1, authorized: false, state: "notice", summary: /Not trusted/ },
  ]) {
    const report = summarizeDomainHealth(target, {
      status: rejected, dns: rejected, headers: rejected, mail: rejected, siteFiles: rejected,
      tls: { status: "fulfilled", value: { validTo, daysRemaining, authorized, authorizationError: null, protocol: "TLSv1.3" } },
    }, checkedAt);
    const tls = report.checks.find((check) => check.id === "tls")!;
    assert.equal(tls.state, state, validTo);
    assert.match(tls.summary, summary);
  }
});

test("health redirect guard restricts schemes, credentials, hosts, and resolved addresses", async () => {
  const signal = new AbortController().signal;
  const publicAddress = async () => [{ address: "93.184.215.14", family: 4 }];
  const guard = createHealthRedirectGuard(new URL(target.url), publicAddress);
  await guard(new URL("/next", target.url), signal);
  await guard(new URL("http://example.com/next"), signal);
  for (const url of [
    "https://other.example/next", "http://127.0.0.1/", "http://169.254.169.254/",
    "ftp://example.com/file", "https://user:password@example.com/next",
  ]) await assert.rejects(guard(new URL(url), signal), /original hostname/);
  for (const [address, family] of [
    ["127.0.0.1", 4], ["127.3.2.1", 4], ["169.254.169.254", 4], ["0.0.0.0", 4],
    ["::1", 6], ["::", 6], ["fe80::1", 6], ["febf::1", 6], ["::ffff:127.0.0.1", 6],
    ["::ffff:169.254.169.254", 6],
  ] as const) {
    const restricted = createHealthRedirectGuard(new URL(target.url), async () => [{ address, family }]);
    await assert.rejects(restricted(new URL("/next", target.url), signal), /loopback/, address);
    const literal = new URL("http://" + (family === 6 ? "[" + address + "]" : address) + "/");
    await assert.rejects(createHealthRedirectGuard(literal)(literal, signal), /loopback/, address);
  }
  const lan = createHealthRedirectGuard(new URL("http://nas/"), async () => [{ address: "192.168.1.10", family: 4 }]);
  await lan(new URL("http://nas/status"), signal);
});

test("health redirect DNS checks obey request cancellation", async () => {
  const controller = new AbortController();
  const guard = createHealthRedirectGuard(new URL(target.url), () => new Promise(() => {}));
  const pending = guard(new URL("/next", target.url), controller.signal);
  controller.abort(new Error("deadline reached"));
  await assert.rejects(pending, /deadline reached/);
});

test("health status and header requests block redirects before fetching the next destination", async (t) => {
  for (const destination of ["http://127.0.0.1/private", "http://169.254.169.254/latest/meta-data", "https://other.example/"]) {
    const calls: string[] = [];
    const bodies: Response[] = [];
    const mocked = t.mock.method(globalThis, "fetch", async (url: URL | string, options: RequestInit) => {
      calls.push(String(url));
      assert.equal(options.redirect, "manual");
      const response = new Response("body", { status: 302, headers: { location: destination } });
      bodies.push(response);
      return response;
    });
    const guard = createHealthRedirectGuard(new URL(target.url));
    const status = await checkStatus(target.url, 1000, guard);
    assert.equal(status.up, false);
    assert.match(status.error ?? "", /original hostname/);
    await assert.rejects(traceHeaders(target.url, { redirectGuard: guard }), /original hostname/);
    assert.deepEqual(calls, [target.url, target.url]);
    assert.ok(bodies.every((response) => response.body?.locked === false && response.bodyUsed));
    mocked.mock.restore();
  }
});

test("health requests follow same-host redirects, preserve HEAD fallback, and report the final URL", async (t) => {
  const calls: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: URL | string, options: RequestInit) => {
    calls.push(options.method + " " + String(url));
    assert.equal(options.redirect, "manual");
    if (String(url) === target.url) return new Response(null, { status: 302, headers: { location: "/final" } });
    return new Response(null, { status: options.method === "HEAD" ? 405 : 200 });
  });
  const guard = createHealthRedirectGuard(new URL(target.url), async () => [{ address: "93.184.215.14", family: 4 }]);
  const status = await checkStatus(target.url, 1000, guard);
  assert.equal(status.up, true);
  assert.equal(status.status, 200);
  assert.equal(status.url, target.url + "final");
  assert.equal(status.redirected, true);
  assert.deepEqual(calls.map((call) => call.split(" ")[0]), ["HEAD", "HEAD", "GET", "GET"]);
  const headers = await traceHeaders(target.url, { redirectGuard: guard });
  assert.deepEqual(headers.chain.map((hop) => hop.status), [302, 200]);
});

test("health requests allow directly entered loopback targets and stop redirect loops", async (t) => {
  let redirect = false;
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => {
    requests++;
    return new Response(null, redirect ? { status: 302, headers: { location: "/again" } } : { status: 200 });
  });
  const local = "http://127.0.0.1/";
  assert.equal((await checkStatus(local, 1000, createHealthRedirectGuard(new URL(local)))).up, true);
  assert.equal((await traceHeaders(local, { redirectGuard: createHealthRedirectGuard(new URL(local)) })).chain[0].status, 200);
  redirect = true;
  requests = 0;
  const guard = createHealthRedirectGuard(new URL(target.url), async () => [{ address: "93.184.215.14", family: 4 }]);
  const status = await checkStatus(target.url, 1000, guard);
  assert.equal(status.up, false);
  assert.match(status.error ?? "", /redirect limit/);
  assert.equal(requests, 4);
});
