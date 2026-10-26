import { X509Certificate } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { getCACertificates } from 'node:tls';

// Node 24.22.1 fixes CVE-2026-111497 and updates its roots to NSS 3.131.1.
// https://nodejs.org/en/blog/release/v24.22.1
export function assertPatchedNode(version) {
  const match = /^(?:v)?(\d+)\.(\d+)\.(\d+)$/.exec(version);
  const [, major, minor, patch] = match?.map(Number) ?? [];
  if (major !== 24 || minor < 22 || (minor === 22 && patch < 1)) {
    throw new Error(`Node ${version} is unsupported. Install Node 24.22.1 or newer in the Node 24 LTS line.`);
  }
}

// Debian's OS bundle update removes G3 and the AAA cross-signing root.
// https://lists.debian.org/debian-security-announce/2026/msg00487.html
const removedSystemRoots = new Set([
  'emSign ECC Root CA - G3',
  'AAA Certificate Services', // Packaged as Comodo_AAA_Services_root.crt.
]);

// NSS 3.131.1 also removes C1 and C3, which patched Debian/Ubuntu OS
// bundles still retain. Apply these additional removals only to Node stores.
// https://github.com/nodejs/node/pull/66877
const removedNodeRoots = new Set([
  ...removedSystemRoots,
  'emSign Root CA - C1',
  'emSign ECC Root CA - C3',
]);

export function assertSafeCertificates(pems, store, source = 'node') {
  if (source !== 'node' && source !== 'system') throw new Error(`Unknown CA source: ${source}`);
  const removedRoots = source === 'system' ? removedSystemRoots : removedNodeRoots;
  if (!pems.length) throw new Error(`${store}: no CA certificates found`);
  for (const pem of pems) {
    const certificate = new X509Certificate(pem);
    const commonName = /^CN=(.+)$/m.exec(certificate.subject)?.[1];
    if (removedRoots.has(commonName)) {
      throw new Error(`${store}: removed CA ${commonName} is still trusted. Update the CA bundle and rebuild/redeploy.`);
    }
  }
}

export function checkRuntimeSecurity({ requireSystemBundle = false } = {}) {
  assertPatchedNode(process.versions.node);
  assertSafeCertificates(getCACertificates('bundled'), 'Node bundled CA store', 'node');
  assertSafeCertificates(getCACertificates('default'), 'Node effective CA store', 'node');

  const bundlePath = '/etc/ssl/certs/ca-certificates.crt';
  const hasSystemBundle = existsSync(bundlePath);
  if (hasSystemBundle) {
    const pems = readFileSync(bundlePath, 'utf8').match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) ?? [];
    assertSafeCertificates(pems, 'OS CA bundle', 'system');
  } else if (requireSystemBundle) {
    throw new Error(`Missing OS CA bundle: ${bundlePath}`);
  }

  console.log(`Security check passed: Node ${process.versions.node}; Node CA stores${hasSystemBundle ? ' and OS CA bundle' : ''} exclude the removed roots.`);
}

checkRuntimeSecurity({ requireSystemBundle: process.argv.includes('--require-system-bundle') });
