import 'reflect-metadata';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { X509CertificateGenerator } from '@peculiar/x509';
import { assertPatchedNode, assertSafeCertificates } from '../scripts/check-runtime-security.mjs';

test('runtime security check rejects unsupported releases and versions before the Brotli fix', () => {
  for (const version of ['20.20.0', '22.23.4', '24.0.0', '24.21.0', '24.22.0', '24.22.1-rc.1', '26.12.1', 'invalid']) {
    assert.throws(() => assertPatchedNode(version), /Install Node 24\.22\.1/);
  }
  for (const version of ['24.22.1', 'v24.22.1', '24.22.2', '24.23.0']) {
    assert.doesNotThrow(() => assertPatchedNode(version));
  }
});

test('runtime security check rejects the removed CA names but allows the unaffected emSign G1 root', async () => {
  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  for (const commonName of ['emSign ECC Root CA - G3', 'emSign Root CA - C1', 'emSign ECC Root CA - C3', 'AAA Certificate Services', 'emSign Root CA - G1']) {
    const certificate = await X509CertificateGenerator.createSelfSigned({
      serialNumber: '01',
      name: `CN=${commonName}`,
      notBefore: new Date('2026-01-01'),
      notAfter: new Date('2027-01-01'),
      signingAlgorithm: { name: 'ECDSA', hash: 'SHA-256' },
      keys,
    });
    const check = () => assertSafeCertificates([certificate.toString('pem')], 'test CA store');
    if (commonName === 'emSign Root CA - G1') assert.doesNotThrow(check);
    else assert.throws(check, /test CA store: removed CA/);
  }
});

test('runtime security check fails on empty or malformed CA bundles', () => {
  assert.throws(() => assertSafeCertificates([], 'test CA store'), /no CA certificates/);
  assert.throws(() => assertSafeCertificates(['invalid certificate'], 'test CA store'));
});

test('container startup refuses an effective trust store that reintroduces a removed root', async () => {
  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const certificate = await X509CertificateGenerator.createSelfSigned({
    serialNumber: '02',
    name: 'CN=emSign ECC Root CA - G3',
    notBefore: new Date('2026-01-01'),
    notAfter: new Date('2027-01-01'),
    signingAlgorithm: { name: 'ECDSA', hash: 'SHA-256' },
    keys,
  });
  const directory = mkdtempSync(join(tmpdir(), 'webtools-ca-test-'));
  const certPath = join(directory, 'removed-root.pem');
  try {
    writeFileSync(certPath, certificate.toString('pem'));
    const result = spawnSync(process.execPath, ['--import', './scripts/check-runtime-security.mjs', 'server/prod.ts'], {
      cwd: fileURLToPath(new URL('../', import.meta.url)),
      env: { ...process.env, NODE_EXTRA_CA_CERTS: certPath, PORT: '0' },
      encoding: 'utf8',
      windowsHide: true,
      timeout: 5000,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Node effective CA store: removed CA emSign ECC Root CA - G3/);
    assert.doesNotMatch(result.stdout, /WebTools ready/);
  } finally {
    unlinkSync(certPath);
    rmdirSync(directory);
  }
});
