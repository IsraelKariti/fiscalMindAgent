## 1. Server: sliding session

- [x] 1.1 Add `IMPERSONATION_IDLE_MINUTES` (integer, default 1440) to `src/config/env.ts` and document it in `.env.example`. Verify: `npm run typecheck` passes and the app starts with the variable unset.
- [x] 1.2 In `src/api/auth.ts`, add the pure helper `evaluateImpersonationCookie(cookie, realUserId, now)` returning `{ state: 'none' | 'active' | 'expired', targetUserId, refresh }` (refresh = more than 60 s of the idle period used), rebuild `impersonationTarget()` on it, and replace `IMPERSONATION_TTL_MS` with the env-driven idle period; cookie `maxAge` = idle + 7 days (design decision 4). Verify: new `tests/impersonationCookie.test.ts` covers active, expired, bad signature, foreign admin, malformed and the refresh threshold, is added to the `test` script in `package.json`, and `npm test` passes.
- [x] 1.3 In `requireAuth`, re-issue the cookie when the helper says `refresh` and the request counts as activity: no `X-FM-Background` header and no `Accept: text/event-stream` (design decisions 1–2). Verify: with the dev stack running, a normal workspace request returns a `Set-Cookie: fm_impersonate` after the first minute, and a request sent with `X-FM-Background: 1` does not.

## 2. Server: ended-session response and audit

- [x] 2.1 In `requireAuth`, read the declared view-as target (`X-FM-View-As` header or `viewAs` query parameter); when it is present and differs from the effective user, answer `409 { error, code: 'impersonation_ended' }`. Skip the check for `/admin/*`, `/me` and `/auth/*` (design decision 3). Verify with curl against the dev stack: a workspace route with a wrong `X-FM-View-As` returns 409 with that code; the same route without the header behaves as before; `POST /api/admin/impersonate` with the header still succeeds.
- [x] 2.2 When the helper reports `expired`, clear the cookie and record `admin.impersonation_expired` via `recordAudit` (actor = real admin, target = accountant, severity info). Verify: after an expiry, the `#/audit` page (or an `audit_events` query) shows the entry once per expiry, with the admin as actor.

## 3. Web: API layer

- [x] 3.1 In `web/src/api.ts`: module state for the view-as target id with a setter; `request()` sends `X-FM-View-As` when it is set; `tokenizedUrl()` appends `viewAs=`; `request()` accepts `{ background: true }` and then sends `X-FM-Background: 1`. Verify: `npx tsc -p web --noEmit` passes and the browser network tab shows the header on workspace requests while viewing as an accountant, and not in a normal accountant session.
- [x] 3.2 Add `ImpersonationEndedError extends ApiError` (empty message) and a module-level listener; `request()` raises both on a 409 with `code: 'impersonation_ended'`. Verify: typecheck passes.
- [x] 3.3 Mark background traffic: the interval refreshes and SSE-triggered reloads in `ClientView.tsx` and `Overview.tsx` call the API with `{ background: true }`; `EventSource.onerror` in `ClientView` and the sidebar stream triggers one background reload. Verify: in the network tab, the 15 s / 30 s refreshes carry `X-FM-Background: 1` and clicks do not.

## 4. Web: dialog

- [x] 4.1 Add Hebrew strings to `web/src/i18n.tsx` and create `ImpersonationEndedModal` with the existing modal styles, not dismissible, with "start a new session" and "back to the admin panel" and an inline error line (design decision 6). Verify: typecheck passes.
- [x] 4.2 In `App.tsx`: set the API view-as target after `GET /api/me`, register the ended-session listener, keep an idempotent `impersonationEnded` state and render the modal; wire the two buttons (re-impersonate + reload keeping the hash; stop + `#/accountants/:email` + reload). Guard `load()` in `ClientView` and any other site that wraps `err.message` in its own text (grep for them) so no banner shows. Verify: typecheck passes.

## 5. End-to-end verification and docs

- [x] 5.1 Ask the user to restart the dev stack with `IMPERSONATION_IDLE_MINUTES=1`. Verify: working continuously for 3 minutes keeps the session; leaving a client page open and untouched for 2 minutes raises exactly one dialog without a click, with no "Agent not found." banner.
- [x] 5.2 Verify the dialog actions: "start a new session" reopens the same agent and client under a fresh session; "back to the admin panel" lands on the accountant's admin page with no view-as box.
- [ ] 5.3 Verify the other-tab cases: exit view-as in tab A, then act in tab B → dialog in tab B and nothing changed; start viewing as another accountant in tab A, act in tab B → dialog, no data of the other accountant shown.
  - Partly verified 2026-09-18: exit elsewhere + act → one dialog, row unchanged (done). The switch case was checked only with a wrong `X-FM-View-As` id (→ 409), because the local DB has a single accountant; it is the same comparison in `requireAuth`.
- [ ] 5.4 Verify an accountant's own session and the monday object are unaffected (no header sent, no 409), and restore `IMPERSONATION_IDLE_MINUTES` to its default.
  - Partly verified: a request without the view-as declaration behaves as before (200), and the monday transport never sets it. A real accountant sign-in does not exist locally, so that session was not exercised. Restoring the env value is the user's step.
- [x] 5.5 Update the impersonation notes in `docs/agents.md` (sliding idle timeout, the view-as declaration and the 409 code, the background marker for new timers). Verify: the doc names the env var and the rule that new periodic refreshes must pass `{ background: true }`.
