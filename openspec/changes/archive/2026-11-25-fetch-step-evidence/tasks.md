## 1. Runner: capture evidence at every step

- [x] 1.1 In `src/browserRunner/launch.ts`, add a per-page step collector (WeakMap keyed by page) created in `launchInteractivePage()`, with console / error-response / request-failed listeners buffering into the next record; verify with a unit test on the pure buffer-and-flush helper (`tests/stepEvidence.test.ts`).
- [x] 1.2 Make `debugShot(page, name)` record an evidence item (screenshot, main + child frame HTML, MHTML via CDP `Page.captureSnapshot`, record with url/title/time/frames/console/responses), each part guarded by a 10 s timeout and the size caps from design D3, missing parts named with a reason; keep the `TAX_FETCH_DEBUG_DIR` PNG dump. Verify by running `scripts/menoraFetchSmoke.ts` against a local page or by a unit test with a stubbed page that throws on one part and checking the item still holds the others.
- [x] 1.3 In `src/browserRunner/server.ts`, keep an `evidence` map per session that outlives `closeSession()` (reaped at backstop TTL + grace), record a final `<stage>-failed` item in `failureBody()` with the error text, and add `GET /sessions/:id/evidence?after=` (metadata) and `GET /sessions/:id/evidence/:seq/:part` (bytes) behind the bearer middleware. Verify with a supertest-style test on `createRunnerApp()` using a stub provider: items listed after a failed login, bytes served, 404 for a wrong seq/part, 401 without the token.
- [x] 1.4 Bump `RUNNER_PROTOCOL_VERSION` to 4 in `src/browserRunner/protocol.ts` with the history line; verify `npm run typecheck` passes and `/healthz` reports 4.

## 2. Worker: pull and store evidence

- [x] 2.1 Rename `taxFetch/failureShots.ts` to `taxFetch/stepEvidence.ts`: add `evidencePrefixFor(sessionId, createdAt)` (`debug/taxfetch/<day>/<sessionId>/`), `storeEvidenceItem(prefix, item)` writing the png/html/mhtml/json blobs, keep `persistFailureShot` as the 502-screenshot fallback, and `cleanupExpiredEvidence` accepting both key layouts; verify with unit tests on the key builder and the expiry fallback (old flat key and new per-session key).
- [x] 2.2 In `taxFetch/fetchClient.ts`, add `pullEvidence(sessionId)` to `HttpTaxFetchClient` (list with `after=<last seq>`, stream each part, store, never throw) and call it after `startLogin`, `submitOtp` and `downloadDocuments` on success and on the error path before rethrow; in `AciTaxFetchClient` make sure the pull runs before every `teardownSessionContainer`. Verify with a test using a fake `fetch` that serves the runner routes: a failing login still results in stored items and the container teardown is called after the pull.
- [x] 2.3 In `taxFetch/runner.ts`, put `evidencePrefix` in the `detail` of `tax_fetch.login_started` and `tax_fetch.failed` audit rows; verify by a local mock fetch and reading the audit row (`/api/admin/audit-events/<id>`).
- [x] 2.4 `MockTaxFetchClient` writes two synthetic items per session through `storeEvidenceItem`; verify by running a mock fetch locally and listing blobs under the session prefix.
- [x] 2.5 Update the `TAX_FETCH_DEBUG_RETENTION_DAYS` comments in `src/config/env.ts` and `.env.example` to say they cover all step evidence (default stays 14), point `queue/debugCleanupWorker.ts` at `cleanupExpiredEvidence`; verify `npm run typecheck` and the cleanup unit test.

## 3. Admin API

- [x] 3.1 Add `GET /api/admin/tax-fetch/:sessionId/evidence` (session summary + steps grouped by seq from the blob listing, records parsed) and `GET /api/admin/tax-fetch/:sessionId/evidence/:seq/:part?as=view|download` (headers per design D6: png inline, html view sandboxed CSP, html/mhtml download as attachment, nosniff everywhere, strict seq/part validation, key built server-side) under `requireAdmin` in `src/api/router.ts`; verify with a route test: admin gets the list, accountant gets the admin refusal, bad part → 404, html view carries the `Content-Security-Policy: sandbox` header.
- [x] 3.2 Return the last session id from `db/queries/siteAccess.ts` `lastAccess` and include it in the site-access reply; verify with the existing site-access test extended for the id.

## 4. Web

- [x] 4.1 Add `adminFetchEvidence(sessionId)` and the view/download URL builders to `web/src/api.ts`; verify typecheck.
- [ ] 4.2 (built, browser check pending — owner) Build `EvidencePane` (ordered step cards: screenshot, "view HTML" lazy sandboxed iframe, "download HTML", "download snapshot", "record" toggle, missing-part notes, "no evidence kept" and loading states) with Hebrew labels in `i18n.tsx`; verify in the browser on a mock session.
- [ ] 4.3 (built, browser check pending — owner) In `StepDetailModal.tsx`, when the viewer is an admin and `step.target_type === 'tax_fetch_session'`, request the evidence on open and render `EvidencePane` in the two-pane layout (single column + note when empty; accountants never request it); verify in the browser from the admin conversation viewer, under impersonation, and from a step link, plus a narrow window.
- [ ] 4.4 (built, browser check pending — owner) Add the `#/site-access/sessions/:id` route (`admin/route.ts`), the `AdminFetchEvidence` screen (header + `EvidencePane`), and make each site-access card's last-access line a link to it; verify in the browser.

## 5. Docs and verification

- [x] 5.1 Update `docs/agents.md` "Failure diagnostics" to describe step evidence, the blob layout, the routes and the 14-day retention; verify the section reads correctly.
- [ ] 5.2 (tests, typecheck and build:gui pass; local mock fetch + gallery check pending — owner) Run `npm test`, `npm run typecheck`, `npm run build:gui`; then a local mock fetch end to end and open its gallery from the trace step and from the site-access card.
- [ ] 5.3 After deploy, run one live fetch (owner) and confirm the session's evidence appears under `debug/taxfetch/<day>/<sessionId>/` in the production storage account and in the admin gallery.
