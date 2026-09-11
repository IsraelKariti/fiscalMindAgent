# monday.com surfaces

FiscalMind embeds in monday.com as one iframe, served by our own Express
server and built from `web/src/monday/`:

- **Custom object** at `/monday-object` (`web/monday-object.html` →
  `web/src/monday/objectMain.tsx` → `MondayObject.tsx`): the full accountant
  workspace (sidebar, client conversations, documents, files, settings) — the
  same `Workspace` component the standalone SPA renders, added
  to a monday workspace from the left-pane **+** menu like a board or doc.

## How it works

- **Auth** — no login screen in the iframe. The frontend fetches a
  `sessionToken` from the monday SDK on every request and sends it as
  `Authorization: Bearer`; `src/api/mondayAuth.ts` verifies it (HS256, signed
  by monday with the app's Client Secret). The session cookie is never used
  inside the iframes (it's `SameSite=Lax` and would not be sent cross-site
  anyway). URLs that cannot carry headers — the SSE stream and file downloads —
  pass the token as `?sessionToken=` instead (accepted by the same middleware;
  the tokens expire within minutes).
- **Accounts** — first load auto-provisions a fiscalMind user keyed by the
  monday `(account_id, user_id)` pair (`monday_accounts` table, migration 017).
  Provisioning does **not** whitelist: the user sees the access-pending screen
  until an admin whitelists their email, same as standalone Google sign-ins.
  If the monday user's email already
  belongs to a Google-based account, the surface instead offers "link with your
  Google account" — a popup running the normal Google login, carrying a signed
  short-lived token that tells the callback which monday identity to point at
  the signed-in user. This bootstrap lives in
  `web/src/monday/useMondaySession.tsx`.
- **The workspace API mount** — the accountant workspace routes live in
  `src/api/workspace.ts` with no auth of their own and are mounted twice:
  cookie-authenticated at `/api/*` (standalone SPA) and sessionToken-
  authenticated at `/api/monday/app/*` (custom object). `GET /api/monday/me`
  returns the standalone `/api/me` payload for the monday-mapped user so the
  shared shell boots identically. Admin and impersonation routes are
  cookie-only by design. The frontend picks the mount via
  `configureApi` in `web/src/api.ts` (see `web/src/monday/objectMain.tsx`).
- **Monday-only accounts stay inside monday** — accounts auto-provisioned
  from monday carry a synthetic `monday:` google_sub and no Google login, so
  they can only use the custom object. (The dashboard widget and its
  single-use "Open in FiscalMind" handoff were removed 2026-09-11; linking a
  Google account is the way into the standalone SPA.)
- **Clients come from the agent's client-import sources** (workspace Settings
  → Integrations, server-side monday token) and the kickoff webhook — the
  object itself imports nothing through monday's in-iframe auth (the
  seamless-auth board import went with the document collector, 2026-09-11).
- **Framing** — only `/monday-object` carries a
  `Content-Security-Policy: frame-ancestors https://*.monday.com` header; the
  rest of the app sets no framing headers (unchanged).

## Developer Center setup (one-time, manual)

1. <https://monday.com/developers/apps> → **Create app**.
2. **Basic information** → copy the **Client Secret** into `MONDAY_CLIENT_SECRET`
   in this clone's `.env` (each clone/env can share the same app or use its own).
3. **Features** → add a **Custom Object** with custom URL
   `https://<host>/monday-object` (dev host: `<NGROK_DOMAIN>`; prod host:
   the Azure app). If the app still has a **Dashboard Widget** feature from
   before 2026-09-11, remove it — `/monday-widget` no longer exists.
4. **Permissions (scopes)**: enable `me:read`, `boards:read` (the object
   queries `me { email }`; the server reads client boards) and `boards:write`
   (the board status sync).
5. **OAuth** (the "Connect monday" flow behind client-import sources): copy the **Client ID** (Basic
   Information) into `MONDAY_CLIENT_ID` in `.env`, and register the redirect
   URL `https://<host>/api/auth/monday/callback` under the app's OAuth
   settings. This powers the "Connect monday" popup
   (`GET /api/auth/monday/start` → monday authorize → callback stores a
   per-accountant API token in `monday_oauth_tokens`, migration 020). Unlike
   the seamless in-iframe auth above, this token lets the *server* query
   monday at webhook time (boards + docs) with no browser involved. monday
   access tokens don't expire; "Disconnect" just deletes the row.
6. Install the app on the account (**Install** / share URL). Then, in a
   workspace, **+ Add item → Apps → your app**.

## Dev notes

- The iframe is served from `web/dist` by the Express server (the ngrok
  tunnel targets `PORT`), **not** by the Vite dev server — run
  `npm run build:gui` after frontend changes when testing inside monday.
- Emails of accounts provisioned from monday are *claimed* by the frontend
  (monday-verified only); they are never auto-linked to existing Google users —
  that always goes through the Google popup.
- In-process endpoint tests: see the verification script pattern (signs a fake
  sessionToken with `MONDAY_CLIENT_SECRET` and drives `/api/monday/*`,
  including `/api/monday/app/*` and SSE via `?sessionToken=`).
- The custom object has no logout (identity is monday's) and never shows admin
  views; the standalone SPA keeps those.
