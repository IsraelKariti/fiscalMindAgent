## Context

See proposal.md for the motivation. Current state:

- `src/api/auth.ts`: the view-as session is a stateless signed cookie `fm_impersonate` = `<adminUserId>.<targetUserId>.<expiresAtMs>.<hmac>`, issued by `POST /api/admin/impersonate` with `IMPERSONATION_TTL_MS = 30 min` for both the embedded expiry and the cookie `maxAge`. `impersonationTarget()` returns `null` for a missing, expired, badly signed or foreign cookie, and `resolveIdentity()` then falls back to the real (admin) user. `requireAuth` sets `req.userId` / `req.realUserId`.
- Because `maxAge` equals the embedded expiry, the browser drops the cookie at the moment it expires — the server never sees an expired cookie and cannot tell "ended" from "never started".
- `resolveAgentInstance` (`src/api/agents.ts`) then answers 404 "Agent not found." because the agent is not the admin's.
- Web: `request()` in `web/src/api.ts` is the single fetch helper and throws `ApiError(status, message)`. `tokenizedUrl()` builds the header-less URLs (SSE, file download/view). `App.tsx` holds `impersonating` (`{id,email,name}` from `GET /api/me`), and entering view-as is `api.impersonate(id)` followed by a full reload; the `#/as/:email/...` hash survives the reload and the workspace continues to the linked agent and client.
- Background traffic exists: `ClientView` refreshes every 15 s (3 s while drafting) and `Overview` every 30 s while the tab is visible, and both open SSE streams.
- Start/stop are audited through the route map in `src/audit/adminAudit.ts`; `recordAudit()` is available for events that are not a route.
- `npm test` runs `node --test` over an explicit file list in `package.json`.

## Goals / Non-Goals

**Goals:**
- Keep the session stateless (signed cookie, no table, no migration).
- One server-side place decides "active / ended", one client-side place reacts to "ended".
- A forgotten tab still times out.

**Non-Goals:**
- No absolute maximum session length. The admin's own sign-in session (`fm_session`, 7 days) remains the outer bound, because the cookie is only honored for the matching signed-in admin.
- No change to who may impersonate whom, to the admin sign-in session, or to the monday surface.
- No server-side session list or "end all sessions" control.

## Decisions

**1. Sliding refresh of the same signed cookie.**
On a request that counts as activity and carries a valid cookie, `requireAuth` re-issues the cookie with `expiresAt = now + idle`. To avoid a `Set-Cookie` on every response, it re-issues only when more than 60 s of the idle period have been used — capped at a tenth of the idle period, so a short setting (e.g. 1 minute, used for verification) still slides instead of expiring before its first refresh. The idle period comes from a new env var `IMPERSONATION_IDLE_MINUTES` (zod, integer, default 1440) in `src/config/env.ts`, documented in `.env.example`.
*Alternative considered:* a server-side session row with `last_activity_at`. Rejected: needs a migration and a write per request for a single-admin tool; the cookie already carries everything needed.

**2. What counts as activity is decided by the client and enforced by the server.**
Background requests are marked: `request()` gains an option `{ background: true }` that adds the header `X-FM-Background: 1`; `ClientView` and `Overview` pass it from their interval refreshes and from SSE-triggered reloads. The server does not extend the session for requests with that header, nor for requests with `Accept: text/event-stream` (EventSource sets it by itself). Everything else extends.
A malicious client could drop the header, but that only extends its own already-authenticated session, which it could equally do by sending real requests — the marker is for honest idle detection, not a security boundary.
*Alternative considered:* extend only on non-GET requests. Rejected: reading through clients is real work and must keep the session alive.

**3. The client declares its view-as target; the server compares.**
While `impersonating` is set, the SPA sends `X-FM-View-As: <targetUserId>` on every `request()` and appends `viewAs=<targetUserId>` in `tokenizedUrl()` (SSE and file URLs cannot carry headers). `configureApi`-style module state holds the id; `App.tsx` sets it right after `GET /api/me`.
In `requireAuth`: if a view-as target is declared and `identity.effectiveUserId !== declared`, answer `409 { error, code: 'impersonation_ended' }`. This one comparison covers idle expiry, exit from another tab and a switch to another accountant. Without a declaration, behavior is exactly as today (accountants, monday, scripts).
The check is skipped for `/admin/*`, `/me` and `/auth/*`, so the dialog's "start again" (`POST /admin/impersonate`) and the panel itself keep working. It is mounted where `requireAuth` runs for the workspace routers, not in the admin router.
*Alternative considered:* infer "ended" only from an expired cookie. Rejected: it misses the other-tab cases, and it depends on the browser still sending the cookie.

**4. The cookie outlives its embedded expiry, so expiry can be seen and audited.**
Cookie `maxAge` becomes `idle + 7 days` while the embedded `expiresAt` stays `now + idle`. A pure helper `evaluateImpersonationCookie(cookie, realUserId, now)` returns `{ state: 'none' | 'active' | 'expired', targetUserId, refresh }`; `impersonationTarget()` is rewritten on top of it. When `requireAuth` sees `expired`, it clears the cookie and records `admin.impersonation_expired` (actor = real admin, target = accountant, severity info) through `recordAudit`. Clearing on first sight keeps duplicates to the few requests that were already in flight; later requests see no cookie and get the plain 409 from decision 3 without a new audit row.

**5. One global reaction on the client.**
`request()` recognizes status 409 with `code === 'impersonation_ended'`, calls a module-level listener registered by `App.tsx`, and still throws — as a dedicated `ImpersonationEndedError extends ApiError` — so callers' `catch` blocks can skip it. Most call sites use the pattern `setError(err instanceof ApiError ? err.message : fallback)` and render `{error && <banner>}`; `ImpersonationEndedError.message` is an empty string, so those sites show nothing without being touched. `load()` in `ClientView` builds its own text (`clientLoadFailed [detail]`), so it gets an explicit `instanceof ImpersonationEndedError` guard; the apply phase greps for other sites that wrap the message in their own text and guards them the same way. App state `impersonationEnded: boolean` makes repeated signals idempotent: one dialog.
For header-less failures: `EventSource.onerror` in `ClientView` and the sidebar stream triggers one normal (background) reload, which then produces the 409 and the dialog. A file download or view after expiry gets the 409 JSON; this is rare, because the 15 s refresh raises the dialog first.

**6. The dialog.**
New `ImpersonationEndedModal` using the app's existing modal styles (`modal-backdrop` / `modal`), rendered by `App.tsx` above the workspace. It cannot be dismissed without choosing, since nothing behind it works. Buttons:
- "Start a new session" → `api.impersonate(impersonating.id)` then `window.location.reload()`; the untouched `#/as/:email/agents/:id/clients/:id` hash brings the workspace back to the same place. On failure (e.g. the admin's own sign-in also expired) it shows the error inline and keeps the second button usable.
- "Back to the admin panel" → the existing `stopImpersonating` of `App.tsx`: `api.stopImpersonating()` (harmless if already cleared) and a reload. The `/as/:email/...` hash is left as is — `admin/route.ts` already maps it to that accountant's admin page, the same place the sidebar's exit button leads to.
Hebrew strings go to `web/src/i18n.tsx`.

**7. Tests.**
`tests/impersonationCookie.test.ts` covers `evaluateImpersonationCookie`: active, expired, bad signature, foreign admin, malformed, and the refresh threshold. The file is added to the `test` script list. The 409 path and the dialog are verified by driving the running app with `IMPERSONATION_IDLE_MINUTES=1`.

## Risks / Trade-offs

- [A view-as session can now last for days while the admin stays active; the old 30-minute cap was a deliberate limit on a stolen admin cookie] → Every action is still attributed to the real admin in the audit trail; the idle period is one env var and can be lowered per environment (production could run 60 minutes while local runs 24 hours); the admin sign-in session still bounds it.
- [Requests already in flight at the moment of expiry can write two or three `impersonation_expired` audit rows] → Accepted; the cookie is cleared on first sight, so it cannot grow further.
- [A call site forgets `{ background: true }` on a timer, and an open tab never idles out] → Only two timers exist today (`ClientView`, `Overview`); the tasks name them, and the 1-minute verification run catches a miss.
- [The 409 reaches code that shows `err.message` in a banner] → The empty message plus the global dialog; verified on the documents card and client load.
- [Rollback] → Revert the commit. Old cookies stay valid under the old code until their embedded expiry; nothing persisted needs cleanup.

## Open Questions

- Should production use a shorter idle period than the 24-hour default? It is a deploy-time setting and does not affect the build.
