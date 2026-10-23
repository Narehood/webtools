# WebTools

> **Coming soon.** This project is under active development and is **not a finished release**. Interfaces, tool behavior, and the Docker image may change without notice. Use it locally at your own risk; do not treat it as production-ready.

> **Do not put this on the public internet.** WebTools has no login, rate limit, or abuse controls. Anyone who can open it can run WHOIS, DNS, TLS, and HTTP checks **from your machine**, which will get that host (and you) spammed or blocked. Keep it on your LAN. If you need access from outside, put a [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/routing-to-tunnel/) in front **and** require [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/) (or another login gate). A tunnel without Access is still a public website.

Self-hosted everyday utilities, inspired by a dense toolbox layout. Image and text work stay in the browser where possible. Status, WHOIS, DNS, certificates, headers, and mail records are checked from this machine — they only leave the host to reach the target you type.

## IT-Tools comparison and additions

The catalog was compared with [tools.lab.frydae.dev](https://tools.lab.frydae.dev/) on October 15, 2026 (the site's `v2024.10.22-7ca5933` release). All **86 reference utilities** map to a WebTools page in [`docs/frydae-comparison.json`](docs/frydae-comparison.json). Related conversions share a page across **47 new comparison pages**. Seven accompanying tools—QR reader, PDF merge/split, image color picker, favicon generator, domain health, Docker run to Compose, and date calculator—bring the complete catalog to **106 tools**. Bulk photo repair and the interest calculator add two more pages, for **108 tools**.

| Area | New tools |
| --- | --- |
| Crypto | Bcrypt hash/compare, ULIDs, AES encryption/decryption, BIP39 mnemonics and seeds, RSA PEM keys, password strength analysis |
| Formats | TOML/JSON/YAML conversion, XML/JSON conversion and XML formatting, YAML formatting, SQL formatting, Base64 files |
| Text | NATO spelling, UTF-8 binary, Unicode escapes and code points, list conversion, email normalization, string masking, numeronyms, FIGlet banners, searchable emojis |
| Network | IPv4 representations, exact IPv4 range-to-CIDR covers, MAC vendor lookup, MAC generation, IPv6 ULA prefixes, random ports |
| Developer | HTTP Basic-auth headers, social meta tags, MIME types, user-agent parsing, HTTP status reference, Outlook SafeLink decoding, Git and regex references, rich-text/HTML editing, timing benchmark comparison |
| Browser and images | Device information, keyboard events, camera photos/video, SVG placeholders |
| Calculators | Roman numerals, math expressions, ETA, stopwatch/laps, phone formatting, IBAN validation |
| Files | PDF signature integrity checker |

Existing tools now include additional hash/HMAC algorithms, UUID versions 1/3/4/5/6/7, token character-group controls, integer bases 2–64, CSS color names, OTP validation, cron generation, QR colors, additional temperature scales, and Markdown-to-HTML export. Existing URLs remain available.

The 47 comparison pages run in the browser. Encryption uses a WebTools AES-256-GCM JSON envelope with PBKDF2-SHA256 (600,000 iterations), so it does not decode other sites' legacy ciphertext formats. RSA, PDF cryptographic verification, and camera access require HTTPS or localhost. PDF verification checks detached CMS signatures against signed byte ranges and reports later unsigned bytes; it does not validate certificate trust, revocation, or timestamp authorities. The HTML preview is sandboxed with scripts and external requests disabled. The benchmark tool compares supplied timing samples.

MAC lookup uses a bundled [IEEE registry](https://standards.ieee.org/products-programs/regauth/) snapshot, including MA-L, MA-M, and MA-S prefixes. Emoji names and characters come from [Unicode's emoji data](https://unicode.org/Public/emoji/latest/emoji-test.txt), under the [Unicode data license](https://www.unicode.org/license.txt). Both datasets load only when needed. Refresh them with `node scripts/update-utility-data.mjs`, then rebuild. Registry updates require internet access; ordinary lookups do not send addresses to a third party.

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
WEBTOOLS_VERSION="$(node -p "require('./package.json').version")" docker compose up --build -d
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
| `WEBTOOLS_TAG` | `latest` | Image tag. Use `latest`, a pinned package version such as `0.1.0`, or a `sha-` tag for one build |
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
docker build --build-arg VERSION="$(node -p "require('./package.json').version")" -t ghcr.io/narehood/webtools:latest .
docker run -d --name webtools --restart unless-stopped -p 8080:8080 ghcr.io/narehood/webtools:latest
```

The image is Node 24 on Alpine. `main` publishes `latest` and an immutable `sha-<commit>` tag. The version in `package.json` is published once from `main`, or from a matching `v<version>` git tag, and later builds do not move it. A git tag that does not match `package.json` fails the build. Bump that version to publish the next pin. Network tools need outbound access from the container (DNS, 443, WHOIS on 43, and the single port you type in Port check). The first GHCR package is often created as private — set it public under the repo’s **Packages** tab so `docker pull` works without a token.

### Local development

```bash
nvm install
nvm use
npm ci
npm run dev
```

Needs Node 24.22.1 or newer in the Node 24 LTS line. `.nvmrc` selects 24.22.1; if you use a different Node manager, install that version before running `npm ci`. This is the [October 2026 security release](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases). Both Docker stages use `node:24.22.1-alpine`, and CI pulls the base image on every build to pick up Alpine updates. Open [http://localhost:5173](http://localhost:5173).

Run `npm test` for parser, hashing, image-format, and production-server regression checks. Run `npm run build` to type-check and build the app. Container builds run both checks.

Hashing runs locally on both HTTP and HTTPS. Copy buttons use a fallback on LAN HTTP; if a browser blocks copying, select the output and copy it manually. Use HTTPS through your reverse proxy when handling secrets across a network.

## Privacy

| Where it runs | What |
| --- | --- |
| **This browser** | Images, EXIF, PDF pages, QR generation and reading, hashes, JWT decode, text and JSON comparison, URLs, Docker conversion, date calculations, theme, favorites |
| **This server** | Bulk photo ZIP storage, CPU color correction and EXIF orientation; domain health, site status, SSL, WHOIS, DNS and resolver comparisons, HTTP headers, mail auth, site files, port check, egress IP, reverse DNS |
| **Optional cloud AI** | Bulk photo scene/damage assessment and scratch/crease repair, when enabled by the user and configured with a server API key |

No accounts. Browser tools keep files in the browser. Bulk photo repair uploads its ZIP to this server; its optional AI features send photo copies to OpenAI only when selected and explicitly enabled for the run. Anyone with access to this server's UI can see, download, process, and delete saved photo jobs and use its configured API key. Use the existing private-LAN or authenticated-proxy deployment.

The catalog is grouped into **Images**, **Files**, **Network**, **Developer**, **Text**, **Calculators**, and **Crypto**. Existing tool URLs and favorites continue to work after the category changes.

---

## Images

**Bulk photo repair**
For hands-on correction, choose **Prepare for manual review** to keep scanned colors and prepare photos with CPU/EXIF processing only. Once photos are ready, open **Review & correct photos** and use **Focus view** for a large preview. Warmth, tint, brightness, contrast, saturation, automatic color balance, and a gray/white-point picker preview immediately. Compare with the original, rotate left/right or 180°, and use **Save & next** to save full-resolution output and mark the photo reviewed. Keyboard shortcuts: `L` / `R` rotate, left/right arrows move, `Enter` saves and advances, `Space` toggles the original, and `Esc` leaves focus view. Sliders keep their normal keyboard controls. Moving to another photo or thumbnail saves pending edits; **Discard changes** restores the last saved settings. Filter unreviewed/flagged photos, jump to a photo number, and resume at the last viewed photo in this browser. Pause a running batch before saving manual edits; browsing completed photos remains available.

Manual edits do not call cloud AI. The original batch result is retained and every manual save renders from that same result, avoiding cumulative corrections or repeated JPEG degradation. **Reset to batch result** restores that result, including its exact encoded bytes after saving. ZIP downloads always include the latest saved manual output and review settings in the report. Allow extra disk space for retained batch images plus the latest manual results and temporary save files. Unsaved changes must be saved or discarded before switching jobs or downloading the ZIP.

Open `/photo-repair` for archives up to 8 GB and 5,000 photos (150 MB / 60 megapixels per photo; 40 GB total expanded image data). Uploads use resumable 8 MB chunks and the archive is read from disk, including ZIP64 files. JPEG, PNG, TIFF, WebP, GIF (first frame), and AVIF use server codecs; HEIF support depends on the installed sharp/libvips codecs. Encrypted archives and symbolic links are refused. Unsupported files are counted as skipped. Original ZIPs stay intact. Each photo gets its own color analysis; CPU output keeps pixel dimensions, honors EXIF orientation, converts to sRGB and removes metadata. Edited names use `_edited`, preserve subfolders, and resolve duplicate names without overwriting.

Start with **Try 5 photos**, compare originals/results, and then **Process remaining photos**. Jobs run one at a time, independently of the browser tab. Pause finishes the current photo. Restarted jobs stay paused until explicitly resumed; completed results persist. Failed photos can be retried explicitly. Scene orientation uses cloud vision; confidence below 85% leaves the image unrotated and flags it for review. Manual left/right rotation is available after pausing. Cloud repair can target detected damage or every photo; all AI repairs require visual review because generated details, faces, text, framing and dimensions can differ from the original. CPU processing does not repair physical damage. Cloud repair inputs are limited to a 2048-pixel longest edge; outputs use the model's returned dimensions without stretching back to the scan resolution.

Cloud features need a billed OpenAI API account and `OPENAI_API_KEY` in the **server environment**, then a server restart. CPU correction/metadata rotation need no key. No API keys are accepted or stored by the browser. Optional server overrides: `PHOTO_REPAIR_IMAGE_MODEL` (default `gpt-image-2.5-sunburst`) and `PHOTO_REPAIR_VISION_MODEL` (default `gpt-5-mini`). Requests follow the [image edits API](https://developers.openai.com/api/reference/resources/images/methods/edit) and [structured vision output](https://developers.openai.com/api/docs/guides/structured-outputs). The job's repair-attempt cap counts failures as well as successes; vision assessments cost extra, normally one per photo. No dollar estimate is implied. API failures pause the job without automatic paid retries. Check usage before retrying timed-out or interrupted requests.

Set `PHOTO_REPAIR_DIR` to storage with room for the uploaded ZIP, all edited results, previews, and one decoded image at a time. A 2.59 GB source needs more than 5.18 GB free just to pass the initial upload check; PNG results can need substantially more. Docker Compose and Portainer use the `photo-repair-data` volume at `/app/data/photo-repair`; keep it across container replacements. For a plain `docker run`, add `-v photo-repair-data:/app/data/photo-repair` and optionally `-e OPENAI_API_KEY`. Local development uses exported environment variables; `.env.example` documents the settings. A reverse proxy must permit 8 MB upload request bodies and streamed ZIP downloads. Downloads stream completed images plus `_webtools_report.json` as ZIP/ZIP64, including a report of failed/unprocessed images. **Delete job from server** removes the uploaded copy and results; it does not touch your local source archive. There is no automatic retention cleanup (up to 20 jobs).

**Photo color fix**  
Remove yellow, faded, or off-color casts from scanned prints and negatives. Each photo's red, green, and blue channels are stretched to full range and its near-neutral areas are balanced to gray, like a darkroom auto-color pass. Flat black film rebates and white scanner-lid margins are left out of that measurement. Adjust the auto strength, pick a spot that should be gray, or fine-tune warmth, tint, brightness, contrast, and saturation, with a before/after split view. Drop photos or a whole folder (subfolders included), up to 100 photos at 80 MB and 40 megapixels each, review corrected thumbnails, then download one photo or a ZIP of the batch at full resolution. By default JPEG and WebP stay in their format at 95% quality, and PNG, BMP, GIF, and AVIF are saved as lossless PNG. Re-encoding drops metadata. TIFF is not supported by browsers, so convert TIFF scans to PNG or JPEG first. Processing stays in this tab.

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

**Image color picker**  
Drop an image to sample an exact pixel or extract a palette. Pick by clicking the image or entering pixel coordinates. Copy the selected color or the full palette. Transparent pixels are excluded from the palette. Images are limited to 20 MB and 40 megapixels.

**Favicon generator**  
Create 16, 32, 48, 180, 192, and 512 pixel PNGs, a multi-size `favicon.ico`, `site.webmanifest`, and an HTML snippet in a downloadable ZIP. Choose padding and a transparent or solid background. The image is processed in the browser.

---

## Files

**QR reader**  
Drop or paste a raster image to decode a QR code locally. The decoded content is copyable; HTTP(S) links can be opened explicitly. Supports the browser's raster formats, with a 20 MB file limit. Images containing several QR codes return the first code detected.

**PDF merge & split**  
Add one or more PDFs, reorder files or individual pages, rotate pages, and download the whole result or just selected pages. Export different selections to split a document. Processing stays in this browser, with limits of 30 MB per file, 75 MB total, and 200 pages. Encrypted PDFs are not supported. Export creates a new page-based document; document-level features such as bookmarks, interactive forms, and digital signatures are not preserved as a complete document.

---

## Network

These tools run on the host. The browser asks this app; this app talks to the internet.

**Domain health check**  
One domain produces a combined report for site status, DNS, TLS, headers, mail authentication, and site files. Each check has its own summary and details, so partial failures remain visible. The report is a diagnostic snapshot, not a blanket security score.

**Site status**  
HEAD/GET a URL from this machine, then show up/down, status code, latency, and the final URL after redirects.

**SSL certificate**  
Open a TLS session and read the peer certificate: issuer, subject, expiry, days remaining, protocol, fingerprint.

**WHOIS**  
Query WHOIS servers from this host and show registrar, dates, name servers, and status as labeled fields. The original WHOIS text stays folded underneath.

**DNS lookup**  
Resolve A, AAAA, MX, NS, CNAME, and TXT with the container’s (or machine’s) resolver. Each type is listed on its own line.

The resolver comparison mode checks A and AAAA answers using the local resolver and selected public resolvers (Cloudflare, Google, and Quad9), including TTLs and lookup errors. Queries run from the server; they are not tests from multiple geographic locations. Different answers can be normal for geographic routing or split DNS. Public resolver access requires outbound DNS connectivity.

**Headers & redirects**  
Follow up to ten hops with `redirect: manual` and show status plus a header table for each hop.

**Mail auth**  
MX records plus SPF, DMARC, and a handful of common DKIM selectors (`default`, `google`, `selector1`, `k1`, and similar), each record on its own line.

**Site files**  
Fetch `robots.txt`, `/.well-known/security.txt`, and `/security.txt` over HTTPS from this host. Redirects that leave the host are refused.

**Port check**  
TCP connect from this host to one hostname and one port. Timeout, latency, open or closed. Not a port scan.

**Egress IP**  
Public address this container uses outbound, compared with the browser’s public IP.

**Reverse DNS**  
PTR names for an IPv4 or IPv6 address using this machine’s resolver.

**CIDR calculator**  
Network, mask, broadcast, usable range, and whether an IP sits inside the prefix. Runs in this tab.

---

## Text, developer tools & calculators

**URL cleaner & inspector**  
Strip `utm_*`, click IDs (`fbclid`, `gclid`, and related), and other tracking parameters. Switch to the inspector to edit the scheme, credentials, hostname, port, path, fragment, and query parameters, including repeated parameter names. Rebuilding uses the browser URL encoder and may normalize URL spelling.

**Text & JSON diff**  
Line-by-line comparison of two drafts. Green arrived, coral left. JSON mode reports added, removed, and changed values by path, ignoring whitespace and object-key order while preserving array order. Invalid or oversized JSON is reported before comparison.

**Docker run to Compose**  
Paste a `docker run` command to create copyable Compose YAML. Supports common environment, port, volume, name, network, restart, user, working directory, entrypoint, and command options. Unsupported flags produce an error; CLI-only behavior is explained separately. Commands and substitutions are never executed, and environment values are never read from this machine.

**Date calculator**  
Count calendar days, Monday–Friday weekdays, and weekend days between two dates, or add/subtract calendar days or weekdays. The earlier date is included and the later date is excluded unless both-date inclusion is selected. Reversed ranges return negative counts. Holidays are not excluded. Calendar arithmetic avoids daylight-saving time shifts and supports years 0001–9999.

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
Choose Unix seconds, Unix milliseconds, or an ISO string explicitly, then convert to local time and back. Negative epochs are supported. “Use now” fills the selected format.

**Cron explainer**  
Five-field cron (`minute hour day month weekday`) turned into a plain-English description, plus the next five runs in local time. When both the day-of-month and weekday are restricted, a run matches either field.

**Time zones**  
Take a local date and time and show it in common zones. A custom IANA name or a fixed offset such as `UTC-5` can be added.

**Color converter**  
One color as hex, RGB, and HSL, with a picker.

**Markdown preview**  
Headings, lists, emphasis, fenced code, and `http`, `https`, or `mailto` links. Rendered in this tab. HTML in the source is shown as text.

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

**Text counter**  
Characters, words, lines, paragraphs, sentences, and a reading time at about 200 words a minute.

**Number bases**  
Binary, octal, decimal, and hexadecimal. Prefixes `0b`, `0o`, and `0x` override the selected base.

**Encode & decode**  
URL encoding and HTML entities, both directions, in this tab.

**Lorem ipsum**  
Placeholder paragraphs. Choose how many paragraphs and how many sentences in each.

**Line tools**  
Trim, unique, sort, reverse, and number lines, in that order.

**Percentages**  
What is X% of Y, what percent one number is of another, and the percent change between two values.

**Aspect ratio**  
Simplify a width and height, then scale either side and keep the ratio.

**Interest calculator**

Open `/interest-calculator` under **Calculators** for compound savings, simple interest, and fixed-rate loan repayments. Choose a nominal annual rate or APY, daily through annual or continuous compounding, years/months/days, and a 365- or 360-day basis. Optional recurring deposits have their own frequency, beginning/end timing, and annual increase. Compare a second rate and estimate tax deducted at maturity plus inflation-adjusted purchasing power. Loan mode supports payment frequency and extra principal payments, with interest and time saved. Eight display currencies, live charts, monthly/yearly savings tables, a full repayment schedule, copyable summaries, examples, and CSV downloads run entirely in the browser. Currency selection does not perform exchange-rate conversion. The expandable calculation notes explain fractional-period growth, contribution boundaries, and rounding assumptions.

Loan schedules allocate cumulative rounding to the selected currency's precision so displayed payments equal principal plus interest and the totals match the CSV. Displayed payments can vary slightly; the underlying projection uses unrounded payments.

**Billable hours**

Enter start and end times with separate AM/PM buttons (or choose 24-hour time), or switch to total hours and enter a decimal such as `7.5` for 7 hours 30 minutes. Total hours supports up to four decimal places and sessions longer than one day. Unambiguous 24-hour entries such as `13:30`, `00:30`, and `23:15` also work in the default 12-hour mode and convert when you leave the field. A single minute digit is accepted: `1:5` means `1:05`. Add an hourly rate and an optional unpaid break in minutes, which is subtracted in either mode. Shows billable hours and total pay, with a copyable summary. Earlier end times count as the next day; matching times mean zero hours. Pay uses exact entered time and rounds only the final total to cents. Rounded decimal hours are marked approximate; the summary includes them only when re-entering those hours at the same rate reproduces the total pay. Switching entry methods keeps your inputs. Everything is calculated in your browser.

---

## Crypto

**Hash & checksum**  
SHA-256, SHA-1, or SHA-512 of a text message, computed locally with the bundled hash library.

**File checksum**  
Drop any file and hash the bytes locally (same algorithms).

**JWT peek**  
Decode header and payload only. Signatures are **not** verified and the token is not sent anywhere.

**Base64**  
Encode or decode UTF-8 text with the browser codec.

**Password generator**  
Cryptographically random strings with length and optional symbols.

**Passphrase**  
Three to twelve words from a built-in list, joined by a hyphen, space, or period. Entropy is shown next to the result.

**HMAC**  
HMAC-SHA-256, SHA-384, or SHA-512 of a message and secret. Both stay in this tab. The digest is hexadecimal.

**TOTP & htpasswd**  
Six-digit authenticator codes from a Base32 secret, plus a bcrypt `user:hash` line for basic auth. Secrets stay in this tab.

**Cert & key peek**  
Decode PEM certificates, CSRs, and OpenSSH public keys (subject, SAN, expiry, fingerprints). Private keys are detected and not decoded or uploaded.

---

## Settings

Open **Settings** from the sidebar or the header. Light, dark, and system appearance, plus the accent color, are saved in this browser. Star a tool from the sidebar, its card, or its page to pin it under Favorites on the home page and at the top of the sidebar. Favorites can also be removed from Settings. Recent tools stay off until you turn them on in Settings. Press `/` to focus search. Category chips on the home page filter the catalog.

## Notes

- Background removal is a local corner-sample lift, not a cloud ML model.
- JWT peek will not tell you whether a token is valid — only what is inside it.
- Network tools need outbound access from the host (port 43 for WHOIS, 443 for TLS, DNS for lookups, plus the single port you type in Port check).
- Do not expose port 8080 to the internet. There is no authentication.
