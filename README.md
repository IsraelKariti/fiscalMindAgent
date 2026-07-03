# fiscalMindAgent

Node agent that emails a client on an accountant's behalf to collect a form_106 document, using scheduled follow-ups whose timing and content are decided by an LLM based on the email conversation so far.

## Architecture

- **Postgres** stores users, allocated agent mailboxes (`agent_mailboxes`), clients, the email thread, and one pending BullMQ job id per client (`scheduled_jobs`).
- **BullMQ + Redis** schedule a one-shot delayed `send_email` job representing "the next send" for a client. There is never more than one pending job per client.
- **Resend** handles all email on the agent domain (`AGENT_EMAIL_DOMAIN`, default `fiscalmind.app`). Each accountant claims a permanent agent name in the dashboard; the agent sends **from** and receives **at** `<name>@fiscalmind.app`. Inbound mail arrives as an `email.received` webhook (`/webhooks/resend`, Svix-signed); replies are threaded with standard `In-Reply-To`/`References` headers built from stored Message-IDs.
- **Two processes**, sharing the same modules:
  - `src/web.ts` — Express server receiving Resend inbound-email webhooks (`/webhooks/resend`) and serving the dashboard + API.
  - `src/worker.ts` — BullMQ `Worker` that actually sends emails when a `send_email` job fires.
- After every send (worker) and every new inbound client email (webhook), the same `removeFutureEmail` + `setFutureEmail` sequence runs: cancel any pending scheduled send, then ask Gemini (structured output) whether the goal is complete or another follow-up is needed, and act on the decision. Both paths take a Postgres advisory lock per client so they can never race across the two processes.

See `src/orchestration/` for the core logic, `src/gemini/` for the LLM prompt/schema, and `src/webhook/onInboundEmail.ts` for inbound handling.

## Dashboard GUI

A React (Vite) dashboard lives in `web/` and is served by the same Express process (`src/web.ts`) once built. It provides:

- **Login** — Google sign-in (`GOOGLE_OAUTH_CLIENT_ID`/`SECRET` in `.env`), session held in a signed HTTP-only cookie (`DASHBOARD_SESSION_SECRET`).
- **Agent mailbox picker** — first-run banner where the accountant claims a permanent `<name>@fiscalmind.app` address for their agent (live availability check).
- **Client card** — name, email, occupation, company, phone, notes (editable), goal status, engagement start date.
- **Timeline** — the full email thread (inbound/outbound) plus the next scheduled follow-up (draft content and send time).
- **System prompt editor** — edit the Gemini system-prompt template used for every decision call. Placeholders like `{{client_name}}` are substituted per client at call time; the template is stored in the `app_settings` table and can be reset to the built-in default.

```bash
cd web && npm install && cd ..
npm run build:gui     # outputs web/dist, served by `npm run dev:web` / `start:web` at http://localhost:3000
# or, during GUI development (hot reload, proxies /api to :3000):
npm run dev:gui       # http://localhost:5173
```

Set the Google OAuth vars (and optionally `DASHBOARD_SESSION_SECRET`) in `.env` and run `npm run db:migrate` before first use.

## Local setup

### 1. Prerequisites

- Node.js >= 20
- Docker (for Postgres + Redis via `docker-compose`)
- [ngrok](https://ngrok.com/) with a static/reserved domain (a random one changes on every restart, requiring you to re-point the Resend webhook endpoint each time)
- A [Resend](https://resend.com) account with the agent domain verified for sending and receiving
- A Google Cloud project with an OAuth client for dashboard sign-in

### 2. Install and configure

```bash
npm install
cp .env.example .env   # fill in the values below
```

### 3. Resend setup (agent email domain)

1. **Domain**: in the Resend dashboard, add the agent domain (`fiscalmind.app`) and create the DNS records it shows — MX + SPF TXT on `send.<domain>` and a DKIM TXT on `resend._domainkey.<domain>` (optionally a `_dmarc` TXT). Wait for "Verified".
2. **Receiving**: enable receiving on the domain and add the single inbound MX record shown. Receiving is a catch-all: every local part on the domain routes to Resend, and the app only processes addresses that exist in `agent_mailboxes`.
3. **Webhook**: add a webhook endpoint pointing at `https://<static-subdomain>.ngrok-free.dev/webhooks/resend` (dev) or `<APP_BASE_URL>/webhooks/resend` (prod), subscribed to the `email.received` event only. Put its signing secret into `.env` as `RESEND_WEBHOOK_SECRET`.
4. **API key**: create an API key with sending access → `.env` `RESEND_API_KEY`.

### 4. Google sign-in setup

Create an OAuth 2.0 Client ID of type **Web application** with redirect URI `<APP_BASE_URL>/api/auth/google/callback` (scopes: `openid email profile` only). Put the client id/secret into `.env` as `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET`.

### 5. Run the app

```bash
npm run db:migrate
npm run dev        # Postgres+Redis (docker), web, worker, GUI dev server, and the ngrok tunnel
```

Sign in at http://localhost:3000, claim an agent name in the banner, and add a client.

### 6. Bootstrap the first client (CLI alternative)

```bash
npm run cli:bootstrap -- --name "Jane Doe" --email jane@example.com \
  --subject "Form 106 needed for your 2025 filing" \
  --body-file ./drafts/jane-first-email.txt \
  --delay-minutes 1
```

This creates the client and enqueues the first `send_email` job — it does not send immediately. The worker process must be running for the job to fire at its scheduled time.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev:web` / `dev:worker` | Run the two processes locally with auto-reload |
| `npm run build` / `start:web` / `start:worker` | Compile and run the built output |
| `npm run db:migrate` | Apply pending SQL migrations from `migrations/` |
| `npm run cli:bootstrap` | Create a client and schedule its first outreach email |
| `npm run typecheck` | Type-check without emitting |

## Known limitations (local-dev scope)

- BullMQ delayed jobs live only in Redis; a Redis restart without persisted AOF data (enabled by default in `docker-compose.yml`) can desync `scheduled_jobs` from actual queue state.
- Single client/thread scope, though the schema is `client_id`-keyed throughout so it generalizes.
