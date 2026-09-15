# WebTools

> **Coming soon.** This project is under active development and is **not a finished release**. Interfaces, tool behavior, and the Docker image may change without notice. Use it locally at your own risk; do not treat it as production-ready.

Self-hosted everyday utilities, inspired by a dense toolbox layout. Image and text work stay in the browser where possible. Status, WHOIS, DNS, certificates, headers, and mail records are checked from this machine — they only leave the host to reach the target you type.

## Run

### Local development

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

### Docker Compose (homelab)

From a clone, build and start:

```bash
docker compose up --build -d
```

After GitHub has published the image, skip the build and pull instead:

```bash
docker compose pull
docker compose up -d
```

Open [http://localhost:8080](http://localhost:8080). Stop with `docker compose down`.

### Docker

```bash
docker pull ghcr.io/narehood/webtools:latest
docker run -d --name webtools --restart unless-stopped -p 8080:8080 ghcr.io/narehood/webtools:latest
```

Build it yourself instead of pulling:

```bash
docker build -t ghcr.io/narehood/webtools:latest .
docker run -d --name webtools --restart unless-stopped -p 8080:8080 ghcr.io/narehood/webtools:latest
```

The image is Node 22 on Alpine. Network tools need outbound access from the container (DNS, 443, WHOIS on 43). The first GHCR package is often created as private — set it public under the repo’s **Packages** tab so `docker pull` works without a token.

## Privacy

| Where it runs | What |
| --- | --- |
| **This browser** | Images, EXIF, hashes, JWT decode, text transforms, QR, URLs |
| **This server** | Site status, SSL, WHOIS, DNS, HTTP headers, mail auth |

No accounts. Files you drop are not uploaded to a third party.

---

## Images

**Background remover**  
Samples the corners of a photo and lifts a flat studio color. Best on product shots with a solid backdrop. Processing stays in this tab.

**Image convert**  
Re-encode a raster image to PNG, JPEG, WebP, or AVIF (if the browser supports it) using the canvas API.

**Image compress**  
Same encoder with a quality slider so you can compare file size before you keep the result.

**Resize & crop**  
Set an output size, lock aspect ratio if you want, and crop by pixel rectangle. Encoded on-device.

**EXIF viewer**  
Parse camera, lens, exposure, timestamps, and GPS in this browser. Copy tags as JSON. If GPS is present, open the point on OpenStreetMap. The photo is not uploaded.

**EXIF stripper**  
Re-encode the image so capture tags (including GPS) are dropped, then download a clean copy.

---

## Network

These tools run on the host. The browser asks this app; this app talks to the internet.

**Site status**  
HEAD/GET a URL from this machine, then show up/down, status code, latency, and the final URL after redirects.

**SSL certificate**  
Open a TLS session and read the peer certificate: issuer, subject, expiry, days remaining, protocol, fingerprint.

**WHOIS**  
Query WHOIS servers from this host for registrar, dates, and nameservers.

**DNS lookup**  
Resolve A, AAAA, MX, NS, CNAME, and TXT with the container’s (or machine’s) resolver.

**Headers & redirects**  
Follow up to ten hops with `redirect: manual` and show status plus response headers for each hop.

**Mail auth**  
MX records plus SPF, DMARC, and a handful of common DKIM selectors (`default`, `google`, `selector1`, `k1`, and similar).

---

## Text

**URL cleaner**  
Strip `utm_*`, click IDs (`fbclid`, `gclid`, and related), and other tracking parameters. The rest of the URL is left alone.

**Text diff**  
Line-by-line comparison of two drafts. Green arrived, coral left.

**JSON formatter**  
Pretty-print or minify, and surface syntax errors before anything ships.

**CSV / YAML / JSON**  
Convert CSV → JSON, JSON → CSV, YAML → JSON, and JSON → YAML in this tab.

**Regex tester**  
JavaScript regex against a sample string. Matches are listed with their index.

**Case converter**  
Lower, upper, title, camel, Pascal, snake, kebab, and CONSTANT_CASE.

**UUID & slug**  
Cryptographically random UUID v4 values, short NanoIDs, and a URL slug from a title.

**Timestamp**  
Unix seconds, milliseconds, or an ISO string, converted to local time and back. “Use now” fills the current clock.

**Cron explainer**  
Five-field cron (`minute hour day month weekday`) turned into a plain-English description.

**QR code**  
Draw a scannable SVG in the browser. Download the SVG. No remote renderer.

**Color contrast**  
WCAG 2 contrast for a foreground / background pair, with AA / AAA / fail.

---

## Crypto

**Hash & checksum**  
SHA-256, SHA-1, or SHA-512 of a text message via Web Crypto.

**File checksum**  
Drop any file and hash the bytes locally (same algorithms).

**JWT peek**  
Decode header and payload only. Signatures are **not** verified and the token is not sent anywhere.

**Base64**  
Encode or decode UTF-8 text with the browser codec.

**Password generator**  
Cryptographically random strings with length and optional symbols.

---

## Notes

- Background removal is a local corner-sample lift, not a cloud ML model.
- JWT peek will not tell you whether a token is valid — only what is inside it.
- Network tools need outbound access from the host (port 43 for WHOIS, 443 for TLS, DNS for lookups).
