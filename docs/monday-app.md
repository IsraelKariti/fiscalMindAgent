# monday.com surfaces

FiscalMind embeds in monday.com as two iframes, both served by our own Express
server and built from `web/src/monday/`:

- **Dashboard widget** at `/monday-widget` (`web/monday-widget.html` →
  `web/src/monday/widgetMain.tsx`): glanceable overview stat tiles +
  needs-attention list, plus client import from a board connected to the
  dashboard.
- **Custom object** at `/monday-object` (`web/monday-object.html` →
  `web/src/monday/objectMain.tsx` → `MondayObject.tsx`): the full accountant
  workspace (sidebar, client conversations, documents, files, settings, board
  import) — the same `Workspace` component the standalone SPA renders, added
  to a monday workspace from the left-pane **+** menu like a board or doc.

## How it works

- **Auth** — no login screen in either iframe. The frontend fetches a
  `sessionToken` from the monday SDK on every request and sends it as
  `Authorization: Bearer`; `src/api/mondayAuth.ts` verifies it (HS256, signed
  by monday with the app's Client Secret). The session cookie is never used
  inside the iframes (it's `SameSite=Lax` and would not be sent cross-site
  anyway). URLs that cannot carry headers — the SSE stream and file downloads —
  pass the token as `?sessionToken=` instead (accepted by the same middleware;
  the tokens expire within minutes).
- **Accounts** — first load auto-provisions a fiscalMind user keyed by the
  monday `(account_id, user_id)` pair (`monday_accounts` table, migration 017)
  and whitelists it at the `normal` tier. If the monday user's email already
  belongs to a Google-based account, the surface instead offers "link with your
  Google account" — a popup running the normal Google login, carrying a signed
  short-lived token that tells the callback which monday identity to point at
  the signed-in user. This bootstrap is shared by both surfaces
  (`web/src/monday/useMondaySession.tsx`).
- **The workspace API mount** — the accountant workspace routes live in
  `src/api/workspace.ts` with no auth of their own and are mounted twice:
  cookie-authenticated at `/api/*` (standalone SPA) and sessionToken-
  authenticated at `/api/monday/app/*` (custom object). `GET /api/monday/me`
  returns the standalone `/api/me` payload for the monday-mapped user so the
  shared shell boots identically. Admin, impersonation, and prompt-template
  routes are cookie-only by design. The frontend picks the mount via
  `configureApi` in `web/src/api.ts` (see `web/src/monday/objectMain.tsx`).
- **Standalone handoff** — "Open in FiscalMind" (widget) doesn't just link to
  the app: it fetches `GET /api/monday/app-login-url`, which returns a
  single-use, 60-second handoff URL (`/api/auth/monday-handoff?token=…`) that
  sets the regular session cookie and redirects into the SPA. This is the only
  way monday-only accounts (synthetic `monday:` google_sub, no Google login)
  can enter the standalone app; replays and expired tokens bounce to
  `/?login_error=monday_handoff_failed`.
- **Board import** (widget only) — the widget reads the connected board with
  monday's seamless API (user's own permissions, no stored monday tokens):
  board columns → pick the email (+ optional phone) column → `items_page`
  pagination → POST `/api/monday/clients/import`, which skips existing emails,
  so re-importing is safe. Importing requires the account to have claimed an
  agent mailbox first.
- **Framing** — only `/monday-widget` and `/monday-object` carry a
  `Content-Security-Policy: frame-ancestors https://*.monday.com` header; the
  rest of the app sets no framing headers (unchanged).

## Developer Center setup (one-time, manual)

1. <https://monday.com/developers/apps> → **Create app**.
2. **Basic information** → copy the **Client Secret** into `MONDAY_CLIENT_SECRET`
   in this clone's `.env` (each clone/env can share the same app or use its own).
3. **Features** → add:
   - a **Dashboard Widget** with custom URL `https://<host>/monday-widget`
   - a **Custom Object** with custom URL `https://<host>/monday-object`

   (dev host: `<NGROK_DOMAIN>`; prod host: the Azure app.)
4. **Permissions (scopes)**: enable `me:read` and `boards:read` (the surfaces
   query `me { email }`, and the widget reads board items via seamless auth).
5. Install the app on the account (**Install** / share URL). Then:
   - widget: on any dashboard, **Add widget → Apps → your widget**, and connect
     the board(s) holding clients via the widget settings.
   - custom object: in a workspace, **+ Add item → Apps → your app**.

## Dev notes

- Both iframes are served from `web/dist` by the Express server (the ngrok
  tunnel targets `PORT`), **not** by the Vite dev server — run
  `npm run build:gui` after frontend changes when testing inside monday.
- Emails imported/provisioned from monday are *claimed* by the frontend
  (monday-verified only); they are never auto-linked to existing Google users —
  that always goes through the Google popup.
- In-process endpoint tests: see the verification script pattern (signs a fake
  sessionToken with `MONDAY_CLIENT_SECRET` and drives `/api/monday/*`,
  including `/api/monday/app/*` and SSE via `?sessionToken=`).
- The custom object has no logout (identity is monday's) and never shows admin
  views; the standalone SPA keeps those.
