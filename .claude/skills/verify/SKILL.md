---
name: verify
description: How to drive this app's running dev stack to verify changes end-to-end (API, SSE, webhook paths).
---

# Verifying fiscalMindAgent changes against the running dev stack

The user runs `npm run dev` in their own terminal — never start or restart it.
Check it's up first: `curl http://127.0.0.1:$PORT/healthz` (ports come from `.env`).

## Gotchas

- **Loopback families differ**: the Express server (`PORT`) answers on `127.0.0.1`;
  the Vite GUI (`GUI_PORT`) binds IPv6, so hit it via `http://[::1]:GUI_PORT`.
  Plain `localhost` picks the wrong family for one of them.
- `dev:web`/`dev:worker` run under `node --watch-path=./src`, so source edits are
  already live in the running processes — no rebuild step.

## Authenticated API calls

Sessions are HMAC cookies (`fm_session=<userId>.<expiresAtMs>.<hmac sha256 of
"userId.expiresAtMs" keyed by DASHBOARD_SESSION_SECRET>`, see `src/api/auth.ts`).
For verification, mint one with a Node script that reads `.env` and queries
Postgres (`DATABASE_URL`) for a real user/client id. **Write the cookie to a
scratchpad file** (e.g. a curl `-H @header.txt` file) — never print it to stdout,
and delete the file when done.

## Useful drive points

- Client detail (goal status, `nextScheduled`): `GET /api/clients/:id`
- Timeline data: `GET /api/clients/:id/emails`
- Live update stream: `GET /api/clients/:id/events` (SSE; also works through the
  Vite proxy). To simulate a worker-side state change without touching data,
  publish the client id on the Redis channel `client_updated`
  (`REDIS_URL` in `.env`, ioredis available from the repo's node_modules).

## Avoid

- Anything that triggers `setFutureEmail` (document status flips, inbound
  webhook replays): it spends a real Gemini call and schedules a real email send.
- Canceling/removing `scheduled_jobs` rows of real clients — that's the user's
  live dev data.
