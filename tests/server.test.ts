import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createConnection } from "node:net";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

let child: ChildProcess;
let base: string;
let port: number;

async function deadline<T>(promise: Promise<T>, ms = 3000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Timed out")), ms);
    })]);
  } finally { clearTimeout(timer!); }
}

before(async () => {
  child = spawn(process.execPath, ['server/prod.ts'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    env: { ...process.env, PORT: '0' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let errors = '';
  child.stderr!.on('data', (chunk) => { errors += chunk; });
  port = await deadline(new Promise<number>((resolve, reject) => {
    child.stdout!.on('data', (chunk) => {
      const match = String(chunk).match(/0\.0\.0\.0:(\d+)/);
      if (match) resolve(Number(match[1]));
    });
    child.once('error', reject);
    child.once('exit', (code) => reject(new Error(`Server exited ${code}: ${errors}`)));
  }), 5000);
  base = `http://127.0.0.1:${port}`;
});

after(async () => {
  if (child && child.exitCode === null && !child.killed) {
    const exited = once(child, 'exit');
    child.kill();
    await deadline(exited);
  }
});

async function rawRequest(target: string) {
  const socket = createConnection(port, '127.0.0.1');
  let response = '';
  socket.setEncoding('utf8');
  socket.on('data', (chunk) => { response += chunk; });
  try {
    await deadline(once(socket, 'connect'));
    socket.write(`GET ${target} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`);
    await deadline(once(socket, 'end'));
    return response;
  } finally { socket.destroy(); }
}

async function post(path: string, value: unknown) {
  return fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
}

async function listen(server: Server) {
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No upstream address');
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: Server) {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
}

test('malformed request targets return 400 without terminating the production server', async () => {
  assert.match(await rawRequest('http://['), /^HTTP\/1\.1 400/);
  assert.deepEqual(await (await fetch(base + '/api/health')).json(), { ok: true, service: 'webtools' });
  assert.equal(child.exitCode, null);
});

test('invalid static paths and missing assets do not crash the server', async () => {
  assert.equal((await fetch(base + '/assets/does-not-exist.js')).status, 404);
  assert.match(await rawRequest('/%E0%A4%A'), /^HTTP\/1\.1 400/);
  assert.equal((await fetch(base + '/api/health')).status, 200);
});

test('API rejects non-object and oversized JSON bodies', async () => {
  for (const value of [null, [], 'text', { url: 'a'.repeat(70000) }]) {
    const response = await post('/api/status', value);
    assert.equal(response.status, 400);
    assert.ok((await response.json()).error);
  }
  assert.equal((await fetch(base + '/api/health')).status, 200);
});

test('header traces cancel streaming bodies at every redirect hop', async () => {
  let closed = 0;
  let allClosed: () => void;
  const cancelled = new Promise<void>((resolve) => { allClosed = resolve; });
  const upstream = createServer((req, res) => {
    res.on('close', () => { if (++closed === 2) allClosed(); });
    res.writeHead(req.url === '/' ? 302 : 200, req.url === '/' ? { Location: '/last' } : {});
    res.write('A streaming body that never finishes');
  });
  const target = await listen(upstream);
  try {
    const response = await post('/api/headers', { url: target });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).chain.map((hop: { status: number }) => hop.status), [302, 200]);
    await deadline(cancelled);
    assert.equal(closed, 2);
  } finally { await close(upstream); }
});

test('status falls back from unsupported HEAD and cancels the GET body', async () => {
  const methods: string[] = [];
  let closed: () => void;
  const cancelled = new Promise<void>((resolve) => { closed = resolve; });
  const upstream = createServer((req, res) => {
    methods.push(req.method!);
    if (req.method === 'HEAD') res.writeHead(405).end();
    else { res.on('close', closed); res.writeHead(200); res.write('Still streaming'); }
  });
  const target = await listen(upstream);
  try {
    const response = await post('/api/status', { url: target });
    const result = await response.json();
    assert.equal(result.status, 200); assert.equal(result.up, true);
    assert.deepEqual(methods, ['HEAD', 'GET']);
    await deadline(cancelled);
  } finally { await close(upstream); }
});
