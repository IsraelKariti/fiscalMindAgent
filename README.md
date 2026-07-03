# fiscalMindAgent

Node agent that emails a client on an accountant's behalf to collect a form_106 document, using scheduled follow-ups whose timing and content are decided by an LLM based on the email conversation so far.

## Architecture

- **Postgres** stores clients, the email thread, one pending BullMQ job id per client (`scheduled_jobs`), and Gmail push sync state (`gmail_sync_state`).
- **BullMQ + Redis** schedule a one-shot delayed `send_email` job representing "the next send" for a client. There is never more than one pending job per client.
- **Two processes**, sharing the same modules:
  - `src/web.ts` — Express server receiving Gmail push notifications via a Pub/Sub push subscription (`/webhooks/gmail`).
  - `src/worker.ts` — BullMQ `Worker` that actually sends emails when a `send_email` job fires.
- After every send (worker) and every new inbound client email (webhook), the same `removeFutureEmail` + `setFutureEmail` sequence runs: cancel any pending scheduled send, then ask Gemini (structured output) whether the goal is complete or another follow-up is needed, and act on the decision. Both paths take a Postgres advisory lock per client so they can never race across the two processes.

See `src/orchestration/` for the core logic, `src/gemini/` for the LLM prompt/schema, and `src/webhook/onInboundEmail.ts` for Gmail history-based inbound detection.

## Local setup

### 1. Prerequisites

- Node.js >= 20
- Docker (for Postgres + Redis via `docker-compose`)
- [ngrok](https://ngrok.com/) with a static/reserved domain (a random one changes on every restart, requiring you to re-point the Pub/Sub subscription each time)
- A Google Cloud project with the Gmail API and Cloud Pub/Sub API enabled

### 2. Install and configure

```bash
npm install
cp .env.example .env   # fill in the values below
```

### 3. Google Cloud / Gmail setup

1. **OAuth consent screen**: type "External", publishing status "Testing". Add your Gmail address as a test user. Scopes: `gmail.send`, `gmail.readonly`.
2. **OAuth client**: create an OAuth 2.0 Client ID of type **Desktop app**. Put the client id/secret into `.env` as `GMAIL_OAUTH_CLIENT_ID` / `GMAIL_OAUTH_CLIENT_SECRET`.
3. **Pub/Sub topic**:
   ```bash
   gcloud pubsub topics create gmail-form106-notifications
   gcloud pubsub topics add-iam-policy-binding gmail-form106-notifications \
     --member="serviceAccount:gmail-api-push@system.gserviceaccount.com" \
     --role="roles/pubsub.publisher"
   ```
   Set `GMAIL_PUBSUB_TOPIC=projects/<project-id>/topics/gmail-form106-notifications` in `.env`.
4. **ngrok**: `ngrok http --domain=<static-subdomain>.ngrok-free.app 3000` (matching `.env`'s `PORT`). Set `PUBSUB_PUSH_AUDIENCE=https://<static-subdomain>.ngrok-free.app/webhooks/gmail` in `.env`.
5. **Push subscription**, with OIDC auth so the webhook can verify requests really came from Pub/Sub:
   ```bash
   gcloud pubsub subscriptions create gmail-form106-sub \
     --topic=gmail-form106-notifications \
     --push-endpoint="https://<static-subdomain>.ngrok-free.app/webhooks/gmail" \
     --push-auth-service-account=<sa>@<project>.iam.gserviceaccount.com
   ```

### 4. Bring up infra and authorize Gmail

```bash
docker compose up -d          # Postgres + Redis
npm run db:migrate
npm run gmail:auth            # interactive OAuth flow, opens a URL to authorize; stores tokens in ./secrets/
npm run gmail:watch           # starts Gmail push notifications, seeds gmail_sync_state
```

`npm run gmail:watch` must be re-run at least every 7 days — Gmail's `watch()` expires and is not auto-renewed in this version.

### 5. Run the app

Three long-running processes:

```bash
ngrok http --domain=<static-subdomain>.ngrok-free.app 3000
npm run dev:web       # webhook server
npm run dev:worker    # BullMQ worker — must be running for any scheduled send to actually fire
```

### 6. Bootstrap the first client

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
| `npm run gmail:auth` | One-time interactive Gmail OAuth flow |
| `npm run gmail:watch` | (Re-)start Gmail push notifications |
| `npm run cli:bootstrap` | Create a client and schedule its first outreach email |
| `npm run typecheck` | Type-check without emitting |

## Known limitations (local-dev scope)

- No automated renewal of Gmail's 7-day `watch()` expiry — re-run `npm run gmail:watch` manually.
- BullMQ delayed jobs live only in Redis; a Redis restart without persisted AOF data (enabled by default in `docker-compose.yml`) can desync `scheduled_jobs` from actual queue state.
- Single client/thread scope, though the schema is `client_id`-keyed throughout so it generalizes.
