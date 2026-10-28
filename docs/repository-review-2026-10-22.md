# WebTools Repository Review

Reviewed October 22, 2026, against the current working tree on `container-version-tags`, based on commit `fd5819b54f4ba0152a49af6f0a79ae10296efc7e`. This includes the existing modified and untracked application files, not just the committed version. The initial review left application code unchanged; the authorized fixes described below are now applied in this working tree.

WebTools builds successfully and all **132 automated tests pass**. Claude Opus 5.5 at **xhigh** independently verified all eight findings. Its severity review changed R1 from P1 to P2 and R2, R4, R5, and R7 from P2 to P3: the verified totals are **three P2 and five P3 findings**. All eight now have implementation fixes. Independent Codex reviewers approved the final numeric and publishing corrections with no blockers. Container publishing still needs verification on a real release. The original browser review loaded all 107 catalog tools without uncaught page errors.

## Findings at a glance

| ID | Verified priority | Finding | Current status |
| --- | --- | --- | --- |
| R1 | P2 Medium | Network endpoints accept cross-origin commands | Fixed; rejected requests open zero upstream connections |
| R2 | P3 Low | htpasswd silently truncates long passwords | Fixed; shared UTF-8 boundary and username validation |
| R3 | P2 Medium | Format converters silently change numeric values | Fixed; integers remain exact or cause a clear error |
| R4 | P3 Low | Manual photo edits bypass the global worker limit | Fixed; FIFO CPU-render slot shared by batches and edits |
| R5 | P3 Low | Concurrent workflows can overwrite a version tag | Fixed in workflow; remote release check pending |
| R6 | P2 Medium | Default action buttons have insufficient text contrast | Fixed; button foreground meets 4.5:1 for tested colors |
| R7 | P3 Low | IPv6 URLs become invalid site-file targets | Fixed; bracket and address normalization |
| R8 | P3 Low | HTML entity decoding can decode twice | Fixed; single-pass decoding and invalid-codepoint replacement |

These priorities reflect the documented trusted-LAN deployment model. R1 remains the first fix despite its lower verified severity: cross-origin callers can trigger host-side network work but cannot read the responses, and browser local-network restrictions can limit reachability. R2 retains the first 72 password bytes; its username control-character defect affects direct helper calls because single-line browser inputs strip line breaks. R4 requires concurrent work across jobs. R5 commonly changes only the digest when the two release triggers share a commit. R7 has a working bare-host input workaround.

The reproductions below describe the **pre-fix state**. Original line numbers refer to the initial review snapshot; implementation paths and status paragraphs identify the current changes.

## Detailed findings

### R1 Network endpoints accept cross-origin commands

**P2 Medium.** Locations: [server/api.ts](../server/api.ts#L15), lines 15 and 637 onward. Compare the existing origin checks in [server/photoApi.ts](../server/photoApi.ts#L22), lines 22–24.

**Implementation:** Added `server/requestPolicy.ts`, shared by network and photo APIs. Fetch Metadata allows only `same-origin` or `none`, including rejection of another port classified as `same-site`. Without that metadata, Origin must match Host; this fallback preserves reverse proxies that rewrite Host. Network POST commands require `application/json`, allowing parameters such as charset. No CORS access is enabled. `tests/server.test.ts` confirms rejected requests open zero upstream connections and normal browser/proxy/CLI JSON calls work. DNS rebinding protection through a Host allowlist remains outside this fix.

The network API reads JSON regardless of `Content-Type` and does not validate `Origin` or `Sec-Fetch-Site`. A browser page on another origin can send a simple `text/plain` POST containing JSON. The server then performs the requested HTTP, DNS, or TCP work. Blocking cross-origin response reads with CORS does not prevent that work from happening.

**Reproduction:** In Chrome, a fixture page at `http://localhost:<fixture-port>` sent a `mode: "no-cors"` POST to `http://127.0.0.1:18080/api/status`. The body pointed to a separate temporary HTTP listener. Chrome returned an opaque response, and the target listener recorded one request from WebTools. A direct request carrying `Origin: http://untrusted.example`, `Sec-Fetch-Site: cross-site`, and `Content-Type: text/plain` also returned HTTP 200 and caused the outbound request. This demonstrates the server weakness; browser controls on access to local networks can vary by deployment.

**Impact:** Another page can cause network activity from the WebTools host when its request can reach the service, including requests to internal services. Public exposure of WebTools is not required for the reproduced scenario.

**Fix:** Apply a shared same-origin command policy to every active API endpoint, using the photo API's checks as a starting point. Require JSON content types for JSON commands and reject cross-site browser requests before reading the body or opening an outbound connection. Preserve intentional command-line access through an explicit policy.

**Regression check:** A cross-origin plain-text POST must be rejected and produce zero upstream connections. Same-origin JSON requests must continue to work.

### R2 htpasswd silently truncates long passwords

**P3 Low.** Location: [src/lib/htpasswd.ts](../src/lib/htpasswd.ts#L3), lines 3–8. The stricter counterpart is [src/lib/cryptoUtilities.ts](../src/lib/cryptoUtilities.ts#L114), `bcryptAction`.

**Implementation:** Both password tools now use `src/lib/bcryptPassword.ts` and `bcrypt.truncates` with the same error. htpasswd checks colons and all ASCII control characters before trimming the username. Regression cases cover 72-byte ASCII, accented, and supplementary-character passwords, rejected 73-byte forms, and malformed usernames.

`htpasswdLine` passes passwords directly to bcrypt without enforcing its 72-byte input limit. The separate Bcrypt tool already rejects this condition, so the same password receives different validation depending on the page used.

**Reproduction:** Generate an htpasswd hash for `"a".repeat(72) + "ORIGINAL"`. Both `"a".repeat(72)` and `"a".repeat(72) + "DIFFERENT"` authenticate against that hash. The supplied 80-byte password therefore does not contribute all its characters to the credential.

**Impact:** Users can believe they created a stronger or different password when everything beyond the first 72 UTF-8 bytes is ignored. Multibyte characters reach the limit sooner. The same helper also accepts an embedded newline in a username and can produce a malformed multi-line htpasswd entry.

**Fix:** Reuse the bcrypt tool's UTF-8 byte validation or `bcrypt.truncates`. Reject line breaks and control characters in usernames as well as colons. Report the error before producing a credential.

**Regression check:** Cover 72 and 73 ASCII bytes, multibyte passwords around the byte boundary, and usernames containing CR or LF.

### R3 Format converters silently change numeric values

**P2 Medium.** Locations: [src/pages/tools/DataTools.tsx](../src/pages/tools/DataTools.tsx#L18), line 18; [src/pages/tools/LocalTools.tsx](../src/pages/tools/LocalTools.tsx#L84), lines 84–85; [src/lib/formatUtilities.ts](../src/lib/formatUtilities.ts#L37), `convertToml` and its representability validation.

**Implementation:** `src/lib/safeJson.ts` checks numeric source tokens while skipping quoted strings and reports unsafe plain integer tokens or nonfinite overflow with line and column. Fractional and exponent tokens retain ordinary floating-point behavior. The JSON formatter, diff, JSON-to-CSV, JSON-to-XML, and config conversion paths share this check. YAML integers parse as bigint; YAML and TOML preserve them exactly, with TOML signed-64-bit bounds. JSON output converts safe bigint values and rejects unsafe bigint integers and nonfinite numbers. `src/lib/structuredConversion.ts` centralizes this behavior, re-exported through `formatUtilities.ts`; the Data page uses the importable `dataConversion.ts` entry point and existing size/alias bounds. YAML formatting also preserves integer values. Fractions and high-precision decimals still use ordinary floating-point behavior; formatting can canonicalize `1.0` and `-0`. This is an integer-preservation fix, not arbitrary-precision decimal support. Canonicalization can turn an accepted decimal token into a plain integer that a later conversion rejects: for example, formatting `9007199254740993.0` produces `9007199254740992`, and resubmitting that plain integer triggers the guard.

The CSV / YAML / JSON page directly combines YAML parsing with `JSON.stringify`. YAML infinities and NaN become JSON `null` without an error. In addition, native-number parsing changes integers beyond JavaScript's exact integer range. The newer format converter rejects nonfinite JSON output, but it does not detect integers that have already been rounded during parsing.

**Reproduction:** On `/data`, select YAML → JSON and convert `value: .inf`; the output is `{"value":null}`. `.nan` has the same result. Parsing and serializing `value: 9007199254740993` produces `9007199254740992`. The JSON formatter also changes `{"id":9007199254740993}` to `{"id":9007199254740992}`.

**Additional Opus verification:** JSON diff reported `9007199254740993` and `9007199254740992` as equal. JSON-to-CSV, JSON-to-XML, YAML formatting, and YAML-to-TOML were also affected; the latter wrote a rounded integer as a float. TOML input already rejected unsafe integers by default, and CSV/XML parsing that keeps values as strings was unaffected.

**Impact:** Formatting or converting configuration, identifiers, or counts can change their meaning while presenting the output as successful. This affects data preservation, even though the output is syntactically valid.

**Fix:** Share representability validation across conversion pages. Reject unsupported nonfinite values. Preserve numeric tokens with an appropriate parser, or explicitly reject unsafe integers before precision is lost. Avoid relying on post-parse validation alone to detect rounding.

**Regression check:** Exercise each relevant UI entry point with `.inf`, `.nan`, the exact-integer boundary, and integers just beyond it. Require exact preservation or a clear error.

**Final independent review:** A Codex reviewer approved the correction with no blocking defects. Three focused R3 regression tests and 797 additional scratch assertions passed, covering escaped strings, numeric boundaries, nonfinite values, diagnostics, both JSON diff inputs, bigint output limits, and UI entrypoint wiring.

### R4 Manual photo edits bypass the global worker limit

**P3 Low.** Locations: [server/photoJobs.ts](../server/photoJobs.ts#L174), lines 174–177 and [308–321](../server/photoJobs.ts#L308); [server/photoWorker.ts](../server/photoWorker.ts#L12), full-resolution decoding.

**Implementation:** `server/photoJobs.ts` queues CPU worker renders in FIFO order with capacity one for the process. Batches acquire a slot once per photo, so queued edits can run between photos. Workers settle only after exit, including failures. A separate batch set enforces the one-batch rule while per-job mutation locks stay in place. Four injected-render regression tests cover concurrent edits, batch/edit interleaving, batch start during another job's edit, and failure recovery. All four fail when the slot is removed. Main-thread Sharp preprocessing and preview generation can still overlap a worker; this is a worker-count bound, not a total image-memory bound. A hung worker can stall the shared queue; no new worker timeout was introduced.

Batch processing refuses to start while another job is active, but manual editing checks only whether the same job ID is active. Editing different jobs concurrently starts multiple full-resolution image workers. A manual edit on another job can also overlap a running batch.

**Reproduction:** Two separate temporary jobs were uploaded and processed using CPU-only options. Concurrent `store.edit` calls on their completed photos both succeeded. Instrumenting the store's active-job set recorded a peak of two active jobs; both photos advanced to edit version 1. The fixture photos were small, so this check did not stress memory.

**Impact:** The batch limit does not provide a process-wide resource bound. With allowed images up to 60 megapixels, each raw RGBA buffer alone can occupy about 240 MB before codec and other working allocations. Multiple sessions or jobs can therefore place substantially more memory pressure on a small server than the single-batch design suggests.

**Fix:** Use a shared image-work queue or semaphore for both batch processing and manual rendering. Keep the per-job mutation locks for consistency, and apply a separate explicit global concurrency limit for resource use.

**Regression check:** Start edits for different jobs and an edit during a batch. Verify that the configured global worker count is never exceeded and queued work completes.

### R5 Concurrent workflows can overwrite a version tag

**P3 Low.** Location: [.github/workflows/docker.yml](../.github/workflows/docker.yml#L36), lines 36–76 and 92–104.

**Implementation:** The Docker job uses one publisher concurrency group across refs, cancellation disabled, and `queue: max` to retain pending publishers; PRs have separate groups. The version existence check runs within that serialized job. Main SHA tags are now also checked before publishing, and tag-triggered runs do not publish SHA tags. Automatic `latest` aliases are disabled (`flavor: latest=false`), leaving the explicit main-only tag. Runs with no resulting tags build without pushing. The existing conditional `vX.Y.Z` alias behavior is unchanged: it is emitted only when the tag run is the first version publisher. GitHub does not guarantee queue ordering, so serialization protects write-once tags but does not guarantee that `latest` always corresponds to the newest source commit. Docker/GHCR execution is unavailable locally; verify the second real release run logs that the immutable tag already exists and preserves its digest.

The workflow checks whether a package-version image exists, then builds and pushes later. No concurrency group serializes publishers. Two runs can both observe an unpublished version and both decide to publish it. The later push can replace the tag created by the earlier run, contrary to the intended publish-once behavior.

**Trigger:** Two main-branch pushes with the same new package version, or a main push and matching Git tag, arrive before the first image is published. Both existence checks succeed in the sense of finding no image. Both runs then include the version tag in their pushes.

**Impact:** A supposedly stable version can resolve to different images over time. Which source revision wins depends on completion order. This finding follows directly from the workflow's check-then-push sequence; no remote registry mutation or competing GitHub runs were performed during review.

**Fix:** Serialize all publishers for this image across branches and tags, with cancellation disabled for an active publisher. Keep the existence check inside that serialized section. A group based only on `github.ref` would still allow a main run and tag run to race. GitHub documents shared concurrency groups for this purpose in its [workflow concurrency guidance](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency).

**Regression check:** Trigger two qualifying runs for the same unpublished version and confirm the second preserves the first published digest. Verify the main/tag combination as well.

**Final independent review:** A Codex reviewer approved the publishing correction with no actionable blockers. It checked the current YAML, publisher serialization, immutable tag exclusions, and empty-tag push behavior. The [metadata-action v6 implementation](https://github.com/docker/metadata-action/blob/v6/src/meta.ts) confirms that disabling automatic `latest` still permits the explicit main-only raw tag; its [output code](https://github.com/docker/metadata-action/blob/v6/src/main.ts) confirms that no tags produces an empty output. Live Docker/GHCR validation remains pending.

### R6 Default action buttons have insufficient text contrast

**P2 Medium.** Locations: [src/prefs/Prefs.tsx](../src/prefs/Prefs.tsx#L103), lines 103–110; [src/styles/global.css](../src/styles/global.css#L435), lines 435–442.

**Implementation:** `src/lib/contrast.ts` compares actual contrast, choosing white, the existing near-black, or black. Prefs uses the shared helper and the CSS fallback matches the default green. Every preset plus difficult gray, red, orange, yellow, black, and white custom accents meets 4.5:1 in regression checks. The default green now uses `#1a1612`, approximately 5.60:1. Accent colors used as navigation text need separate per-theme treatment, listed below.

The foreground selector chooses white text until relative luminance exceeds 0.45. With the default green accent, that selects a foreground with insufficient contrast for ordinary button text.

**Reproduction:** Chrome measured an enabled Hash button with foreground `rgb(255, 255, 255)`, background `rgb(30, 165, 76)`, font size 16px, and font weight 600. Its computed contrast ratio is **3.2102:1**. Ordinary text needs at least 4.5:1 under [WCAG 2.2 contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html); this button is below the large-text size exception.

**Impact:** Default primary actions are harder to read for users with reduced vision. The helper also controls selected segmented buttons, so the effect extends beyond one page.

**Fix:** Compare the actual contrast of candidate foregrounds and select one that meets the required ratio. The repository already contains a contrast-based foreground selector in [src/lib/imagePalette.ts](../src/lib/imagePalette.ts#L61). Consolidate that logic instead of using a separate luminance cutoff.

**Regression check:** Check enabled button text against every preset accent, plus representative custom colors. Button text contrasts with its accent background independently of theme.

### R7 IPv6 URLs become invalid site-file targets

**P3 Low.** Location: [server/api.ts](../server/api.ts#L435), `siteFileTarget`, especially lines 449 and 470–471.

**Implementation:** Site-file targets remove URL brackets, validate colon-containing hosts as IPv6, and canonicalize the address before rebuilding an origin. The exported `sameSiteHost` comparison normalizes brackets and equivalent expanded addresses. Tests cover bare/URL forms, default/explicit ports, uppercase hex, invalid colon hosts, and redirect comparisons without depending on Docker IPv6 availability.

When an input includes a scheme, `URL.hostname` retains the square brackets around an IPv6 address. The target builder then adds another pair because the hostname contains colons. The bare bracketed-host branch removes the brackets first, so the two input forms behave differently.

**Reproduction:** `siteFileTarget("https://[::1]:8443")` returns an origin of `https://[[::1]]:8443`. That is an invalid URL, so the site-file requests fail during URL parsing instead of reaching the target. The intended origin is `https://[::1]:8443`.

**Impact:** Pasting a valid IPv6 HTTPS URL into Site files fails despite the tool having explicit IPv6 parsing support.

**Fix:** Normalize the hostname representation once and use URL construction consistently. Add IPv6 brackets only when needed, keeping redirect-host comparison consistent with the chosen representation.

**Regression check:** Compare bare and scheme-qualified IPv6 hosts with default and explicit ports, alongside existing IPv4 and DNS-host tests.

### R8 HTML entity decoding can decode twice

**P3 Low.** Location: [src/lib/toolbox.ts](../src/lib/toolbox.ts#L88), lines 88–96.

**Implementation:** `decodeHtml` uses one regex replacement pass for the five supported case-sensitive names and decimal/hex references. Zero, surrogate, and out-of-range numeric references become U+FFFD. Tests cover nested-looking references, literal-reference round trips, unknown names, absent semicolons, uppercase names, and invalid code points.

The decoder performs separate replacement passes for numeric references and named entities. A numeric reference that produces `&` can create a new named entity that a later pass decodes again.

**Reproduction:** `decodeHtml("&#38;lt;")` returns `<`. A single HTML decoding pass should return the literal text `&lt;`. The hexadecimal form `&#x26;lt;` has the same problem.

**Impact:** Encode & decode can change text by more than one decoding level. This is a conversion correctness issue; this review did not establish script execution through this function.

**Fix:** Decode references in a single tokenization pass so generated text is not processed again. Define and test the supported named-entity set.

**Regression check:** Include nested-looking numeric and named references, ordinary references, and invalid code points.

## Validation results

| Check | Result | Scope |
| --- | --- | --- |
| `npm test` after fixes | 132 passed, 0 failed, 0 skipped | 14 test files; 12 new regression tests |
| `npm run build` | Passed | TypeScript project checks and Vite production build |
| `npm audit --json` | 0 known vulnerabilities reported | Current lockfile and registry response |
| Production server | Started successfully | Node 24.22.1, isolated temporary photo storage |
| Browser route smoke checks | 107 of 107 catalog tools loaded | Chrome, production assets, desktop viewport; no uncaught page errors on those routes |
| Home and Settings | Loaded successfully | Additional browser checks |
| Image conversion sample | Passed | Browser sample encoded and Download became available |
| Photo color sample | Passed | Browser correction loaded with no alert |
| Mobile home | No horizontal overflow | 390 × 844 viewport |
| Initial targeted defect checks | Seven findings reproduced before fixes | R1–R4 and R6–R8; R5 is a workflow inspection finding |
| Post-fix browser checks | Passed | Same-site other-port request opens zero upstream connections; Data and JSON pages reject numeric loss; numeric strings preserved; 14 computed button contrast checks in light/dark themes; zero uncaught page errors |
| Final independent reviews | Approved R3 and R5; no blockers | Three focused R3 tests plus 797 scratch assertions; publishing configuration assertions and primary-source review |
| Workflow shell checks | 9 scenarios passed with a mocked registry | First/repeated version and SHA publication, tag/PR handling, mismatch and registry-auth failures; YAML parsed successfully |

The route checks establish that pages mount and their assets load; they do not establish every operation or input combination on every tool. Browser and server egress-IP responses were stubbed for route checks. No paid cloud image requests were made.

The build emitted Vite's large-chunk warning. The largest generated JavaScript chunk was approximately 1.20 MB before compression, with an estimated gzip size of 605 KB. This is a performance opportunity, not a build failure.

## Coverage and architecture observations

The repository inventory contained 147 maintained files excluding the lockfile, dependency directory, generated build output, and Git internals, before adding this report. The application has 112 source files, including 48 library modules. Review covered the server entry point and API routes; photo upload, archive, persistence, cloud-call, and worker paths; React routing, preferences, shared controls, tool pages, and workbenches; utility implementations; tests and fixtures; data snapshots and their updater; Docker, Compose, Portainer, CI, package, and TypeScript configuration; and documentation.

Useful foundations are already present:

- Most sensitive utility processing stays in the browser, and API credentials remain on the server.
- Photo archives are stored on disk, uploaded in bounded chunks, and exported through a streamed ZIP path. Archive path validation, pixel limits, explicit paid-request consent, and conservative restart handling are present.
- Regex work runs in a terminable worker. File hashing streams bytes and supports cancellation.
- Billing uses integer arithmetic for money, and tests cover rounding and decimal-hour behavior.
- PDF signature results explicitly distinguish signed-byte integrity from certificate trust and later unsigned revisions.
- The build checks both frontend and server TypeScript. Container builds run tests before producing the runtime image.

The documented absence of application authentication, request throttling, automatic photo retention, and supported public exposure is an existing deployment constraint. These are not counted as newly discovered defects. R1 concerns an additional browser-origin boundary within that deployment model.

## Lower priority improvements

1. **Unify image input limits.** The older convert, compress, resize, background, and EXIF paths do not consistently use the newer file/header/dimension preflight helpers. Resize also accepts output dimensions without a total-pixel cap. Apply shared bounds before decoding or allocating large canvases; no destructive memory-pressure test was performed.
2. **Add browser regression coverage.** The current test command has no checked-in browser suite. Preserve a small smoke set plus focused UI checks for numeric conversion, preferences, image operations, and photo review. The failures above show where library tests alone leave gaps.
3. **Improve asset delivery.** Consider compression and cache headers for production static files, further splitting large optional dependencies, and self-hosting the fonts currently requested from Google. Evaluate actual transfer and cache behavior before selecting changes.
4. **Reduce duplicated behavior.** Representation validation, color contrast selection, API request handling, and image preflight have multiple implementations. Shared helpers would keep older pages aligned with the stricter new tools.

5. **Per-theme accent text contrast.** Opus found that accent colors used as navigation/favorite text can fail against theme backgrounds. This is separate from the corrected button foreground selector and needs a theme-aware text color.

## Verification and fixes

Opus 5.5 xhigh verified all eight original findings, implemented the photo queue, and reviewed the combined fixes. Its numeric objection was corrected so plain integer tokens are protected while fractional/exponent tokens retain standard floating-point behavior. The automatic `latest` alias issue it identified was also corrected.

At the user's direction, two independent Codex reviewers completed the remaining reviews using gpt-6.1-sol with xhigh reasoning. Both approved their corrections with no actionable blockers: R3 passed three focused regression tests plus 797 scratch assertions; R5 passed configuration assertions and review against current GitHub documentation and metadata-action v6 source. These approvals close the outstanding independent-review checks.

The full local suite remains at 132 passing tests, and the production build passed after the code corrections. No application changes were made during final review, so those checks were not repeated. Original reproductions remain in this report to make each fix reviewable. Live container publishing still needs a real-release check.

## Limits of this review

Docker was not installed in this environment, so the final Alpine image and Compose/Portainer startup were inspected but not executed. The CI publishing race was not exercised against GHCR. Live paid OpenAI model access and request compatibility were not tested; existing cloud-path tests use fixtures or injected providers. No broad external-host scan, load test, full accessibility audit, or cross-browser/device matrix was performed. Third-party dependency internals and every generated dataset record were not audited individually.

Original line references apply to the pre-fix review snapshot. The authorized implementation fixes are applied, existing local work is preserved, and no commits, deployments, registry mutations, or pull requests were made.
