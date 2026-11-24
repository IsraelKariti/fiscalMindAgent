## Context

See proposal.md — Why. Today's pieces, observed in the code:

- Every provider already calls `debugShot(page, '<provider>-NN-<step>')` (`src/browserRunner/launch.ts`) at each step; it writes a PNG only when `TAX_FETCH_DEBUG_DIR` is set (dev). Production containers have no such dir and their files die with the container.
- A failed step answers its 502 with `screenshotBase64` (`server.ts` → `failureBody`); the worker's `fetchClient.ts` decodes it into `RunnerStepError.screenshotPng`, and `runner.ts` stores it through `failureShots.ts` under `debug/taxfetch/<day>/<sessionId>-<stage>.png`, logs the key and records it on the `tax_fetch.failed` audit row. `debugCleanupWorker.ts` deletes blobs under `debug/taxfetch/` older than `TAX_FETCH_DEBUG_RETENTION_DAYS` (14).
- In `aci` mode (`AciTaxFetchClient`) the container is deleted inside the fetch client: on `startLogin` failure, in the `finally` of `downloadDocuments`, and in `close()`. In static mode the runner closes the browser itself after a download or a non-OTP failure. Any evidence pull must therefore happen inside the fetch client, before those calls.
- The runner holds no platform secrets (`src/browserRunner/env.ts`, no imports from `config/env.ts`). It cannot write to blob storage itself.
- Audit rows for a fetch (`tax_fetch.login_started`, `tax_fetch.otp_submitted`, `tax_fetch.failed`) have `target_type = 'tax_fetch_session'`, `target_id = sessionId`, and already appear as steps in the trace and in `StepDetailModal.tsx`, which has a two-pane layout (`DocumentPane`) for received-file steps.
- The admin site-access screen (`AdminSiteAccess.tsx`, `/api/admin/site-access`, change `provider-access-dashboard`, not yet archived) shows a last-access line per card from `tax_fetch_sessions` but carries no session id yet.

## Goals / Non-Goals

**Goals:**
- Capture at every existing `debugShot` point, with no new call sites in the providers.
- Evidence survives both runner modes (static sidecar, ACI container) and both outcomes.
- No database table: a session's evidence is a blob prefix, found from the session id and its creation day.
- The external site's HTML can never execute on the platform origin.

**Non-Goals:**
- Video recording, HAR files, or Playwright traces (large, and the ACI box is small). The step record covers console + error responses, which is what the current failures needed.
- A search or cross-session browser of evidence; the entry points are the trace step and the site-access card.
- Changing provider logic or step names.

## Decisions

### D1. Capture point: `debugShot` becomes `recordStep`
`launch.ts` keeps `debugShot(page, name)` as the exported name the providers call (no provider edits), but it now (a) still writes the dev PNG when `TAX_FETCH_DEBUG_DIR` is set, and (b) appends an evidence item to a per-page collector: `page.screenshot({fullPage:true})`, `page.content()` plus `frame.content()` for each child frame (each guarded, 10 s timeout), `CDPSession.send('Page.captureSnapshot', {format:'mhtml'})` (Chromium only — this runner is always Chrome), and the record. The collector is a `WeakMap<Page, StepCollector>` created in `launchInteractivePage()`, which also attaches `page.on('console')` and `page.on('response')` (status ≥ 400) / `page.on('requestfailed')` listeners that buffer into the next record.
*Alternative:* a Playwright `context.tracing` zip — richer, but 20–100 MB per session, needs the Playwright viewer, and cannot be partially pulled mid-session.

### D2. Failure moment = one more step
`failureBody()` in `server.ts` calls `recordStep(page, '<stage>-failed', {error})` before building the body, so the failure item is part of the same ordered set. The 502 body keeps `screenshotBase64` for one release (worker fallback when the evidence pull fails); after that it can go.

### D3. Runner keeps evidence in memory per session and serves it over two GET routes
`server.ts` gets an `evidence` map keyed by sessionId, separate from `sessions`, so items outlive `closeSession()` until pulled or until the backstop TTL + grace reaps them. Routes (behind the same bearer middleware):
- `GET /sessions/:id/evidence?after=<seq>` → `{ items: [{ seq, name, at, url, title, frames, console, responses, error, parts: { screenshot: bytes|null, html: bytes|null, mhtml: bytes|null, missing: {part: reason} } }] }` — metadata only.
- `GET /sessions/:id/evidence/:seq/:part` → the raw bytes (`image/png`, `text/html`, `multipart/related`).
Memory bound: screenshot ≤ 8 MB, HTML ≤ 4 MB, MHTML ≤ 24 MB per item, 120 MB per session; an item over budget drops MHTML first, then HTML, and records the drop as a missing part. `RUNNER_PROTOCOL_VERSION` → 4 (the worker must not run against a runner without these routes). `deploy.yml` already builds the runner image per SHA and repoints `TAX_FETCH_ACI_IMAGE`.
*Alternative:* inline every item in each step response — the download response already carries base64 PDFs and would become tens of MB; and a pull endpoint lets the worker fetch incrementally with `after`.

### D4. Worker pulls inside the fetch client, before any teardown
`HttpTaxFetchClient` gets `pullEvidence(sessionId)` and calls it at the end of `startLogin` (success and in the error path, before rethrow), `submitOtp` (both), `downloadDocuments` (both, before the static runner's own close has any effect — the runner keeps evidence after close, see D3). `AciTaxFetchClient` wraps so the pull runs before `teardownSessionContainer`. The pull streams each part to `uploadBlob` and the record to a JSON blob; it tracks the last `seq` pulled per session in `sessionTracker`-style memory (a plain `Map`) and never throws (log + continue). `failureShots.ts` is renamed `stepEvidence.ts`: `persistFailureShot` stays as a fallback for a 502 body that carried a screenshot when the pull returned nothing.

### D5. Blob layout and lookup without a table
Key: `debug/taxfetch/<YYYY-MM-DD of session.created_at>/<sessionId>/<seq padded 2>-<name>.<png|html|mhtml|json>`. The day keeps the current chronological listing and cleanup fallback; the session id makes `listBlobs(prefix)` the whole index. The admin list route reads `tax_fetch_sessions.created_at` to form the prefix, lists the blobs, and groups by `seq`. `recordTaxFetchFailure` (and the login_started row) put `evidencePrefix` in `detail` for the log reader; the UI does not depend on it.

### D6. Admin API
- `GET /api/admin/tax-fetch/:sessionId/evidence` → `{ session: {id, provider, status, error, createdAt}, steps: [{ seq, name, at, url, title, parts: ['screenshot','html','mhtml','record'], missing }] }` (record parsed from the JSON blob).
- `GET /api/admin/tax-fetch/:sessionId/evidence/:seq/:part` with `?as=view|download`. Screenshot: `image/png` inline. HTML view: `text/html; charset=utf-8` + `Content-Security-Policy: sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'` (no `allow-scripts`, no `allow-same-origin` → opaque origin, scripts blocked by both the sandbox and the CSP). HTML download: `attachment`. MHTML: `attachment` only, `application/octet-stream`. All: `X-Content-Type-Options: nosniff`. `seq` validated as an integer and `part` against the allowlist; the blob key is built server-side, never from a client path. `requireAdmin`, same as `audit-events/:id/file`.
*Alternative:* serve HTML as `text/plain` only — safer still, but the user wants to look at the page; the sandbox + CSP pair is the standard way to render untrusted HTML and it is what the user asked for.

### D7. Web
- `StepDetailModal.tsx`: `isFetchSessionStep(step)` = `target_type === 'tax_fetch_session'`; when admin, request the evidence list on open and render an `EvidencePane` in the existing `gate-modal-with-doc` two-pane layout (reuse `isTwoPane` style; narrow screen falls back the same way). Each step card: screenshot `<img>`, buttons "view HTML" (opens a `<iframe sandbox="">` inside the card, lazily, pointing at the view URL), "download HTML", "download snapshot", "record" (toggles a pre block).
- New admin route `#/site-access/sessions/:id` → `AdminFetchEvidence.tsx`, the same `EvidencePane` full-width with a header (provider, status, error, time, client link).
- `siteAccess.ts` `lastAccess` returns the session id; `SiteCard` renders the last-access line as a link to the route.
- Hebrew labels via `i18n.tsx` as the rest of the admin UI.

### D8. Retention and cleanup
`TAX_FETCH_DEBUG_RETENTION_DAYS` keeps its default of 14. `cleanupExpiredFailureShots` → `cleanupExpiredEvidence`: same listing, the key-day fallback regex accepts both the old flat key and the new per-session key.

### D9. Mock
`MockTaxFetchClient` writes two synthetic items per session (a 1×1 PNG, a tiny HTML, a record) through the same store function, so the gallery is testable locally.

## Risks / Trade-offs

- [MHTML capture via CDP may hang on a heavy page] → 10 s timeout per part; a timeout records a missing part and never blocks the step (spec: capture never fails the step).
- [Memory on the small runner box: 3 live sessions × 120 MB] → per-session cap with MHTML dropped first; items are released when pulled (`after` handshake) and on reap.
- [Pull adds latency between OTP steps while one-time codes expire] → the pull after `submitOtp` runs after the 204 is received, i.e. after the code was already accepted; the pull after `startLogin` runs after the OTP was already sent. Neither delays a site interaction.
- [Evidence holds the client's personal financial pages] → same container and same admin-only streaming as the documents themselves; nothing is ever linked publicly; retention bounded.
- [Sandboxed HTML view loses external CSS] → that view is for reading the DOM; the MHTML download is the faithful rendering (opens in Chrome from disk).
- [Protocol bump] → a worker on 4 against a runner on 3 refuses the login with the existing clear error; `deploy.yml` lockstep ships both.

## Migration Plan

1. Ship runner + worker + API + web in one commit (protocol lockstep).
2. No DB migration. Existing flat failure shots keep working in cleanup and simply age out.
3. Rollback: revert the commit; evidence blobs already written age out by the sweep.
