# Running the app locally, end to end (incl. inside monday)

Goal: run the whole stack on your PC, reach it through your ngrok domain, and
have monday load **your local build** in its custom-object iframe —
so you never deploy to prod just to test a change.

Everything below assumes Windows + PowerShell, the repo at
`C:\Users\israe\Documents\projects\fiscalMindAgent`, and the root `.env` that
already exists in that folder. Values in angle brackets (`<NGROK_DOMAIN>`)
mean "the value from your `.env`".

## 0. Before you start (once per boot)

1. **Start Docker Desktop** and wait until its whale icon stops animating.
   `npm run dev` starts Postgres, Redis and Azurite as containers; if Docker
   isn't running the very first line fails with
   `failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine`.
2. **Close any other ngrok** window/terminal. A reserved ngrok domain can only
   be tunnelled by one session at a time; a second one fails with
   `ERR_NGROK_334` / "domain is already in use".
3. Make sure nothing else is listening on the dev ports (`PORT`, `GUI_PORT`,
   `LANDING_PORT` from `.env` — normally 3000, 5173, 3100, plus 4100 for the
   browser runner). Check with:

   ```powershell
   Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in 3000,5173,3100,4100 }
   ```

   Empty output = good.

## 1. `.env` check — the local stack is the real app

Your `.env` holds the **real** Resend, Twilio, Gemini and monday keys, so the
local stack behaves exactly like prod: real emails, real WhatsApp messages,
real LLM calls, and real tax-authority logins driven by the Chrome installed
on your PC (the browser runner opens a visible Chrome window, `channel:
'chrome'`, headed — the tax site trips bot-detection when headless). Your IP
is Israeli, so the tax authority accepts it; nothing else is needed.

Confirm these are set (they are, as of writing): `SECRET_ENC_KEY`,
`DASHBOARD_SESSION_SECRET`, `ADMIN_EMAILS` (your Gmail), `GEMINI_API_KEY`,
`NGROK_DOMAIN`, `MONDAY_CLIENT_ID`, `MONDAY_CLIENT_SECRET`,
`BROWSER_RUNNER_TOKEN`, `TWILIO_*`, `RESEND_*`.

**Missing as of writing — add it for full functionality:**

```dotenv
# Signs the short-lived /media/<token> URLs Twilio fetches when the agent
# sends a document over WhatsApp (e.g. delivering a fetched Form 106).
# Without it that send throws. Any random string, min 16 chars:
#   openssl rand -hex 32
MEDIA_SIGNING_SECRET=
```

Two **optional** fences exist. They are off by default and you don't need
them; they're here so you know what they do if you ever want a throwaway
test client that must not receive anything:

- `OUTBOUND_ALLOWLIST=you@gmail.com,+9725XXXXXXX` — when set, mail/WhatsApp
  to anyone *not* listed is dropped (logged as `outbound message blocked by
  OUTBOUND_ALLOWLIST`) while the flow proceeds as if delivered. Empty =
  unrestricted (current).
- `TAX_FETCH_MOCK=true` — replaces the real tax-authority browser flow with a
  no-browser mock (no OTP is sent to anyone). Default `false` (current) = real.

`.env` is read only when a process starts. **Any `.env` edit ⇒ Ctrl+C the dev
stack and run `npm run dev` again.** (Source edits under `src/` do NOT need
a restart — the processes run under `node --watch`.)

## 2. Install dependencies (once, and after `git pull` touches a lockfile)

```powershell
npm install
npm install --prefix web
npm install --prefix landing
```

## 3. Build the GUI that monday will load

The Vite dev server (port 5173) is only for the standalone dashboard. The
monday iframe (`/monday-object`) is served by Express from `web/dist`, so it
must be **built**:

```powershell
npm run build:gui
```

Verify: `web\dist\monday-object.html` exists.

Tip for fast iteration on frontend code while testing inside monday — in a
**second** terminal keep a watch-rebuild running (skips the type-check, just
rebuilds `web/dist` on every save; reload the monday page afterwards):

```powershell
cd web; npx vite build --watch
```

Run `npm run build:gui` (with type-check) before committing.

## 4. Start the stack

In your own terminal (never from Claude):

```powershell
npm run dev
```

What it does, in order:

| Step | What | How you know it worked |
|---|---|---|
| `docker compose up -d --wait` | Postgres :5432, Redis :6379, Azurite :10000 | `docker ps` shows 3 `fiscalmind-*` containers |
| `npm run db:migrate` | applies pending `migrations/*.sql` | log line `migrations complete` (each file logged as `applying migration:` or `skipping already-applied migration:`) |
| `web` (blue) | Express API + serves `web/dist`, port `PORT` | log `webhook server listening on port 3000`; `curl http://127.0.0.1:3000/healthz` → `{"ok":true,"sha":"dev"}` |
| `worker` (yellow) | BullMQ worker (sends, planner, scans) | log lines `send_email worker started`, `overdue_scan worker started`, … |
| `gui` (green) | Vite dev server, port `GUI_PORT` | open `http://localhost:5173` |
| `landing` (magenta) | Next.js landing, port `LANDING_PORT` | `http://localhost:3100` |
| `browser` (cyan) | browser-runner sidecar :4100 (only if `BROWSER_RUNNER_TOKEN` set) | log `browser runner listening` |
| `ngrok` (gray) | `ngrok http --domain=<NGROK_DOMAIN> 3000` | `https://<NGROK_DOMAIN>/healthz` returns the same JSON |

Also open the ngrok inspector at `http://127.0.0.1:4040` — every request
monday (or Twilio / Resend) sends to your machine shows up there. This is your
best debugging tool for the iframe.

## 5. Sign in standalone and make yourself admin

1. Open `http://localhost:3000` (the built GUI) or `http://localhost:5173`
   (hot-reloading GUI; both talk to the same API).
2. Sign in with Google using the address listed in `ADMIN_EMAILS`. While the
   DB has no admin yet, that first sign-in bootstraps you as admin.
3. You should land in the admin dashboard (`#/` admin routes). If you see the
   "access pending" screen instead, your Google email ≠ `ADMIN_EMAILS`, or an
   admin already exists in the local DB — fix either and sign in again.

Optional demo data (idempotent, undeliverable addresses, safe):

```powershell
npm run db:seed-sandbox -- --force
```

This creates a demo accountant with a declaration-of-capital instance and
three fake (paused, phone-keyed) clients.

## 6. Create a DEV monday app (one time)

Do **not** repoint the production app's URLs at ngrok — that breaks prod for
anyone who has it installed. Use a second app whose only difference is the
host. Full background is in `docs/monday-app.md`; the dummy-proof version
(menu names as in the current Developer Center — an app page has a left
sidebar with **General settings / Build / Host on monday / Manage /
Distribute / Analyze**):

1. Go to <https://monday.com/developers/apps> (**My apps**). As of writing
   there is exactly one app, `FiscalMind` (created 2026-07-08). Click it.
   - **General settings → App Credentials** (scroll down) shows the Client ID
     and Client Secret. This is the app your `.env` currently points at.
   - **Build → Features** shows the Custom Object (and, until it is removed,
     the retired Dashboard Widget); the URLs are
     `https://agent.fiscalmind.app/...` → this is **prod**. Its live
     version (v8) is locked, so it cannot be edited by accident. Leave it.
2. **Back** → **+ Create app** → name it `FiscalMind DEV` (the name shows in
   monday's "Apps" pickers; make it unmistakable).
3. **Build → Features → Add feature**. The **Deployment** step asks where
   the code is hosted — choose **External hosting** (the other options upload
   code to monday's servers; ours runs on your PC), then enter the URL:
   - **Custom Object** → `https://<NGROK_DOMAIN>/monday-object`

   The dev app's version can stay **Draft** — your own account sees drafts.
   If monday refuses to install or show a draft, press **Promote to live**;
   it's the DEV app, nobody else has it.
4. **Build → OAuth & Permissions** (if it isn't under Build, look under
   Manage): enable scopes `me:read` and `boards:read`, and add the redirect
   URL `https://<NGROK_DOMAIN>/api/auth/monday/callback` (used by the
   workspace's "Connect monday" button — client-import sources, the kickoff
   webhook and board status sync).
5. **General settings → App Credentials** → copy **Client ID** and
   **Client Secret** into `.env` as `MONDAY_CLIENT_ID` / `MONDAY_CLIENT_SECRET`.
   The secret is what verifies monday's `sessionToken` JWTs; if it doesn't
   match the app that is actually installed, every `/api/monday/*` call
   returns 401.
6. **Distribute** → install the app on your account (Install / share URL).
7. Restart the dev stack (`Ctrl+C`, `npm run dev`) so the web process picks up
   the new secret.

Alternative (not recommended, but valid): on the prod app press **New
version**, set the draft's feature URLs to the ngrok host, and never promote
it. monday serves draft versions only to the app's own developer account, so
other installs keep v8 — but *your* account then always sees the draft, so you
lose the ability to check prod inside monday from the same account.

## 7. Add the local app to a monday workspace

- **Custom object (full workspace)**: in the left pane click **+** → **Apps**
  → `FiscalMind DEV`. (Clients come from the workspace's Settings →
  Integrations client-import sources.)

First load inside monday:

- The iframe auto-provisions a fiscalMind user keyed by your monday
  `(account_id, user_id)`. If your monday email is the same Gmail you used in
  step 5, the iframe shows **"link with your Google account"** → a popup runs
  the normal Google login and links the monday identity to your admin user.
  Close the popup; the iframe retries on focus.
- If the monday email is a different address, you'll see **access pending**.
  Go to the standalone admin dashboard → **Add accountant** → enter that
  email. Access opens immediately; reload the monday page.

Sanity check that monday is really hitting your PC: in the ngrok inspector
(`http://127.0.0.1:4040`) you should see `GET /monday-object` followed by
`GET /api/monday/me` returning 200.

## 8. Day-to-day loop

| You changed… | What to do |
|---|---|
| anything under `src/` (API, worker, prompts) | nothing — `node --watch` restarts web/worker automatically; reload the page |
| anything under `web/src/` and you test **standalone** | nothing — Vite HMR at :5173 |
| anything under `web/src/` and you test **inside monday** | `npm run build:gui` (or keep `vite build --watch` running), then reload the monday page |
| `.env` | Ctrl+C, `npm run dev` |
| a new migration you pulled | Ctrl+C, `npm run dev` (migrations run on start) or `npm run db:migrate` |
| `landing/` | nothing — Next dev server hot-reloads at :3100 |

Stopping: `Ctrl+C` in the `npm run dev` terminal. The Docker containers keep
running (that's fine and makes the next start faster). To stop them too:
`docker compose down`. To wipe the local DB and start from zero:
`docker compose down -v` (deletes the Postgres/Redis/Azurite volumes).

## 9. Testing the other inbound paths locally

All of these already point at `https://<NGROK_DOMAIN>/…` because the same
domain is used every time (that's why the domain is reserved):

- **Resend inbound mail** → `POST /webhooks/resend`. Reply to an agent email
  from a recipient on `OUTBOUND_ALLOWLIST` and watch it arrive in the
  inspector and the client timeline.
- **Twilio WhatsApp** → `POST /webhooks/twilio`. `TWILIO_WEBHOOK_URL` in `.env`
  must be exactly `https://<NGROK_DOMAIN>/webhooks/twilio` (signatures cover
  the full URL). The sender's webhook in the Twilio console must point at the
  same URL — if prod currently owns that sender, use the Twilio **sandbox**
  number locally instead of repointing a prod sender.
- **Tax-authority 106 fetch** → real by default. The worker calls the local
  browser runner (:4100), which opens a visible Chrome window on your PC and
  drives the real tax-authority site; the OTP goes to the client's phone via
  WhatsApp exactly as in prod. Use your own credentials as the test client.
  The `browser` line in the dev terminal must show `browser runner listening`
  (it only starts when `BROWSER_RUNNER_TOKEN` is set).

## 10. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `npm run dev` dies immediately mentioning `dockerDesktopLinuxEngine` | Docker Desktop not running. Start it, retry. |
| ngrok line prints `already in use` / `ERR_NGROK_334` | Another ngrok session holds the domain. Close it (check Task Manager for `ngrok.exe`). |
| `EADDRINUSE :3000` | Old web process still alive. Find it: `Get-NetTCPConnection -LocalPort 3000 \| Select OwningProcess`, then `Stop-Process -Id <pid>`. |
| Iframe in monday is blank / 404 | `web/dist` missing → run `npm run build:gui`. Or the dev stack isn't running. Check `https://<NGROK_DOMAIN>/monday-object` directly in a tab. |
| Iframe shows an ngrok "You are about to visit…" page | ngrok free-tier interstitial. Click **Visit Site** once per browser session. If it keeps returning, the plan needs upgrading (or tunnel with `cloudflared` and put that host in the DEV app instead). |
| `/api/monday/*` returns **503** | `MONDAY_CLIENT_SECRET` is empty in the running process (edited `.env` but didn't restart). |
| `/api/monday/*` returns **401** | Secret in `.env` belongs to a different monday app than the one installed. Recheck step 6.5. |
| Access pending forever inside monday | Whitelist the monday email from the admin dashboard (step 7), or log in standalone with the same Gmail so the link popup appears. |
| Google sign-in error `redirect_uri_mismatch` | The Google OAuth client must list `http://localhost:3000/api/auth/google/callback` (matches `APP_BASE_URL`). Add it in Google Cloud Console → Credentials. |
| Emails/WhatsApp never arrive | If you set `OUTBOUND_ALLOWLIST`, the recipient isn't on it (worker log warns `outbound message blocked by OUTBOUND_ALLOWLIST`). Otherwise check the worker log for the Resend/Twilio error. |
| WhatsApp document send throws `MEDIA_SIGNING_SECRET is not set` | Add `MEDIA_SIGNING_SECRET` to `.env` (step 1) and restart. |
| Tax fetch fails with a runner/connection error | The browser runner didn't start: `BROWSER_RUNNER_TOKEN` empty, or port 4100 busy. Check the cyan `browser` line in the dev terminal. |
| Migrations fail on start | Read the SQL error; usually a half-applied migration from a crash. Worst case `docker compose down -v` and start fresh (local data only). |

## Quick reference

```text
localhost:3000     Express API + built GUI (what ngrok exposes)
localhost:5173     Vite dev GUI (hot reload, standalone only)
localhost:3100     landing page
localhost:4040     ngrok inspector (see every request monday sends you)
localhost:4100     browser-runner sidecar
https://<NGROK_DOMAIN>            public URL of localhost:3000
  /monday-object                  monday iframe (from web/dist)
  /webhooks/resend, /webhooks/twilio, /api/auth/monday/callback
```
