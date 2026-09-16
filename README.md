# WebTools

> **Coming soon.** This project is under active development and is **not a finished release**. Interfaces, tool behavior, and the Docker image may change without notice. Use it locally at your own risk; do not treat it as production-ready.

> **Do not put this on the public internet.** WebTools has no login, rate limit, or abuse controls. Anyone who can open it can run WHOIS, DNS, TLS, and HTTP checks **from your machine**, which will get that host (and you) spammed or blocked. Keep it on your LAN. If you need access from outside, put a [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/routing-to-tunnel/) in front **and** require [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/) (or another login gate). A tunnel without Access is still a public website.

Self-hosted everyday utilities, inspired by a dense toolbox layout. Image and text work stay in the browser where possible. Status, WHOIS, DNS, certificates, headers, and mail records are checked from this machine — they only leave the host to reach the target you type.

## Run

### Docker Compose

Copy [`docker-compose.example.yml`](docker-compose.example.yml) onto the machine that will run it:

```bash
cp docker-compose.example.yml docker-compose.yml
docker compose up -d
```

Open [http://localhost:8080](http://localhost:8080). Stop with `docker compose down`.

That example pulls `ghcr.io/narehood/webtools:latest`. Bind to `127.0.0.1:8080` instead of `8080:8080` if a tunnel or reverse proxy is the only way in.

From this repo, build the image yourself:

```bash
docker compose up --build -d
```

### Portainer

Use [`portainer-stack.yml`](portainer-stack.yml). It has no `build:` step, so a NAS or Portainer agent only pulls `ghcr.io/narehood/webtools`. Do not deploy the repo `docker-compose.yml` as a stack — Portainer will try to build and fail.

**Web editor:** Stacks → Add stack → name it `webtools` → paste `portainer-stack.yml` → Deploy the stack.

**Git:** Stacks → Add stack → Repository

| Field | Value |
| --- | --- |
| Repository URL | `https://github.com/Narehood/webtools` |
| Reference | `refs/heads/main` |
| Compose path | `portainer-stack.yml` |

Optional environment variables in the stack UI (leave blank for defaults):

| Variable | Default | Meaning |
| --- | --- | --- |
| `WEBTOOLS_TAG` | `latest` | Image tag |
| `WEBTOOLS_PORT` | `8080` | Host port |
| `WEBTOOLS_BIND` | `0.0.0.0` | Set `127.0.0.1` if only a tunnel should reach it |

When you update, turn on **Re-pull image and redeploy** so Portainer fetches a new `latest`. If GHCR is still private, add a `ghcr.io` registry in Portainer with a GitHub token that can read packages.

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

The image is Node 24 on Alpine. Network tools need outbound access from the container (DNS, 443, WHOIS on 43, and the single port you type in Port check). The first GHCR package is often created as private — set it public under the repo’s **Packages** tab so `docker pull` works without a token.

### Local development

```bash
npm install
npm run dev
```

Needs Node 24+. Open [http://localhost:5173](http://localhost:5173).

## Privacy

| Where it runs | What |
| --- | --- |
| **This browser** | Images, EXIF, hashes, JWT decode, text transforms, QR, URLs |
| **This server** | Site status, SSL, WHOIS, DNS, HTTP headers, mail auth, port check, egress IP, reverse DNS |

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

**Port check**  
TCP connect from this host to one hostname and one port. Timeout, latency, open or closed. Not a port scan.

**Egress IP**  
Public address this container uses outbound, compared with the browser’s public IP.

**Reverse DNS**  
PTR names for an IPv4 or IPv6 address using this machine’s resolver.

**CIDR calculator**  
Network, mask, broadcast, usable range, and whether an IP sits inside the prefix. Runs in this tab.

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

**Wi-Fi QR**  
SSID, password, and security into a `WIFI:` payload, drawn as SVG in this tab.

**chmod calculator**  
Owner/group/other bits as octal (`755`) and symbolic (`rwxr-xr-x`), including setuid/setgid/sticky.

**Unit converter**  
Length, area, volume, mass, temperature, speed, time, digital storage, energy, pressure, and angle. SI storage uses 1000 (kB, MB, GB); binary uses 1024 (KiB, MiB, GiB). Bits and bytes are both listed. Click a result to make it the new source.

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

**TOTP & htpasswd**  
Six-digit authenticator codes from a Base32 secret, plus a bcrypt `user:hash` line for basic auth. Secrets stay in this tab.

**Cert & key peek**  
Decode PEM certificates, CSRs, and OpenSSH public keys (subject, SAN, expiry, fingerprints). Private keys are detected and not decoded or uploaded.

---

## Notes

- Background removal is a local corner-sample lift, not a cloud ML model.
- JWT peek will not tell you whether a token is valid — only what is inside it.
- Network tools need outbound access from the host (port 43 for WHOIS, 443 for TLS, DNS for lookups, plus the single port you type in Port check).
- Do not expose port 8080 to the internet. There is no authentication.
