# monday.com dashboard widget

FiscalMind can be embedded as a monday.com **dashboard widget**: an iframe
served by our own Express server at `/monday` (built from `web/monday.html` →
`web/src/monday/`). It shows the overview stat tiles + needs-attention list and
can import clients from a board connected to the dashboard.

## How it works

- **Auth** — no login screen in the iframe. The widget fetches a `sessionToken`
  from the monday SDK on every request and sends it as `Authorization: Bearer`;
  `src/api/mondayAuth.ts` verifies it (HS256, signed by monday with the app's
  Client Secret). The session cookie is never used inside the iframe (it's
  `SameSite=Lax` and would not be sent cross-site anyway).
- **Accounts** — first widget load auto-provisions a fiscalMind user keyed by
  the monday `(account_id, user_id)` pair (`monday_accounts` table, migration
  017) and whitelists it at the `normal` tier. If the monday user's email
  already belongs to a Google-based account, the widget instead offers "link
  with your Google account" — a popup running the normal Google login, carrying
  a signed short-lived token that tells the callback which monday identity to
  point at the signed-in user.
- **Board import** — the widget reads the connected board with monday's
  seamless API (user's own permissions, no stored monday tokens): board columns
  → pick the email (+ optional phone) column → `items_page` pagination → POST
  `/api/monday/clients/import`, which skips existing emails, so re-importing is
  safe. Importing requires the account to have claimed an agent mailbox first.
- **Framing** — only `/monday` carries a `Content-Security-Policy:
  frame-ancestors https://*.monday.com` header; the rest of the app sets no
  framing headers (unchanged).

## Developer Center setup (one-time, manual)

1. <https://monday.com/developers/apps> → **Create app**.
2. **Basic information** → copy the **Client Secret** into `MONDAY_CLIENT_SECRET`
   in this clone's `.env` (each clone/env can share the same app or use its own).
3. **Features** → add a **Dashboard Widget** ("Board view / widget" iframe
   feature). Set the custom URL to:
   - dev: `https://<NGROK_DOMAIN>/monday`
   - prod: `https://<prod host>/monday`
4. **Permissions (scopes)**: enable `me:read` and `boards:read` (the widget
   queries `me { email }` and board items via seamless auth).
5. Install the app on the account (**Install** / share URL), then on any
   dashboard: **Add widget → Apps → your widget**, and connect the board(s)
   holding clients via the widget settings.

## Dev notes

- The widget is served from `web/dist` by the Express server (the ngrok tunnel
  targets `PORT`), **not** by the Vite dev server — run `npm run build:gui`
  after widget changes when testing inside monday.
- Emails imported/provisioned from monday are *claimed* by the widget frontend
  (monday-verified only); they are never auto-linked to existing Google users —
  that always goes through the Google popup.
- In-process endpoint tests: see the verification script pattern (signs a fake
  sessionToken with `MONDAY_CLIENT_SECRET` and drives `/api/monday/*`).
