## Context

See proposal.md for the motivation. What shapes the approach:

- Webhooks are handled in the **web** process. Twilio sends one webhook per WhatsApp message, and a WhatsApp message carries at most one media item, so a turn of N files is N (+1 for the text) independent, concurrent handlers.
- Each handler today ends with `agent.definition.onInboundMessage` → `withClientLock(removeFutureEmail + setFutureEmail)`. The lock only serializes the planner calls; it does not merge them.
- File work (`ingestWaMedia` / `ingestAttachments` → `analyzeStoredFile`) runs inline in the handler, before the hand-off. The download happens **before** the `document_files` row exists, so "pending rows in the DB" alone cannot tell that a file is on its way.
- The **worker** process already runs the planner (after a send). BullMQ with the `{bull}` prefix is the existing job mechanism; Redis is treated as disposable and Postgres is the durable mirror (`resyncScheduledJobs`).
- `clients.drafting_since` already drives the "drafting…" state in the workspace, with a manual retry when `draft_failed_at` is set.

## Goals / Non-Goals

**Goals:**
- One planner call per turn, after all processing of the turn.
- Works across two processes and several concurrent handlers.
- Survives a worker restart and Redis data loss.

**Non-Goals:**
- Moving file analysis out of the webhook handler into a queue.
- Changing what the planner sees or how it decides (covered by `show-unsent-drafts-to-llm`).
- Changing the send-time rules of the draft.

## Decisions

### 1. A delayed BullMQ job per client, not an in-memory timer
New queue `replan`, job id `replan-<clientId>` (no colon: BullMQ rejects custom ids with a `:`; the three-part `send_email:…` ids are its legacy exception), data `{ clientId, turnStartedAt }`. `requestReplan(clientId)` removes a waiting job with that id and adds it again so that it fires at `last inbound + INBOUND_QUIET_SECONDS` (at least 1 s from now). This is the debounce. The window counts from the last inbound webhook, not from the request: a handler asks at its end, after its slow file work, so counting from the request would add up to a full window of dead time after the last file (seen in the first live test: 15 s extra).
*Why not `setTimeout` in the web process:* lost on restart, and the web app can run more than one instance. *Why not plan inline under a longer lock:* still one planner call per webhook.

If the job is already **active** (the planner is running) when a new inbound arrives, BullMQ cannot remove it. `requestReplan` then sets a Redis flag `inbound:{<clientId>}:dirty`; the worker reads and clears it when the planner returns and, if set, moves its own job back to delayed for one quiet window with a fresh `turnStartedAt` (an active job cannot be re-added under the same id). The new plan replaces the just-written draft through the existing `removeFutureEmail` path.

### 2. Two Redis keys describe the turn
- `inbound:{<clientId>}:inflight` — counter. The webhook handler `INCR`s it as its first step after the client is resolved and `DECR`s it in a `finally`. TTL = `INBOUND_MAX_WAIT_SECONDS`, refreshed on every `INCR`, so a crashed handler cannot block forever.
- `inbound:{<clientId>}:last` — timestamp of the latest inbound webhook.

The hash tag `{<clientId>}` keeps a client's keys in one slot on Managed Redis. Keys live outside the `{bull}` prefix.
*Why a counter and not the DB:* the download phase has no row yet (see Context). A DB check is still used as a second signal, below.

### 3. The settle check, in the worker
When the `replan` job fires:
1. `inflight > 0` → not settled.
2. `now - last < quiet window` → not settled.
3. Any `document_files` row of the client with `analysis_status = 'pending'` created in the last `INBOUND_MAX_WAIT_SECONDS` → not settled. (Covers split children and a handler in another web instance.)
4. Not settled and `now - turnStartedAt < max wait` → `job.moveToDelayed(now + 2 s)` + `DelayedError` (same job, same `turnStartedAt`), and re-stamp `drafting_since` — the workspace treats a drafting stamp older than 3 minutes as abandoned.
5. Settled, or max wait passed (log a warning with the three values) → `withClientLock(removeFutureEmail + setFutureEmail)`, exactly what `onInboundMessage` does today.

The rule itself is a pure function `isTurnSettled({ inflight, lastInboundAt, pendingFiles, now, quietMs })` so it can be unit tested without Redis.

### 4. Where the hand-off changes
- `onInboundWhatsApp` / `onInboundEmail`: wrap everything after the client lookup in the in-flight marker; stamp `last`; keep the immediate `removeFutureEmail`; call `clients.markDraftingStarted` right after it so the workspace shows "drafting".
- `declarationOfCapital/index.ts` `onInboundMessage`: keep `maybeHandleOtpInbound` (return early, no replan) and `screenInboundMessage` (inline, inside the in-flight span, fixed reply still immediate); replace the locked `remove + set` with `requestReplan(clientId)`.
- `setFutureEmail` is unchanged. It already re-stamps and clears `drafting_since`, and its guards (complete, paused, admin pause) clear nothing today — the worker clears `drafting_since` when `setFutureEmail` returns early, so a paused client does not stay "drafting".

### 5. Defaults
`INBOUND_QUIET_SECONDS=15`, `INBOUND_MAX_WAIT_SECONDS=300`. WhatsApp delivers the items of one multi-file send within a few seconds of each other; 15 s covers that with margin and keeps a plain text reply fast enough. 300 s is above the slowest observed split + classify of a large PDF.

### 6. Recovery
Redis is disposable. On worker boot, next to `resyncScheduledJobs`: every pending, unpaused client with a `drafting_since` from the last hour, no `scheduled_jobs` row, and no `replan` job gets `requestReplan`. The one-hour bound keeps old abandoned attempts on the existing manual retry instead of drafting for them at every boot. No new table.

### 7. Kill switch
The webhooks already ignore inbound traffic while the platform kill switch is on. The switch can also be turned on during a turn's wait, so the worker checks it right before planning and skips the plan (clearing the drafting stamp).

## Risks / Trade-offs

- [Every reply is later by the quiet window] → 15 s is small next to the planner's own latency; the value is an env var.
- [A client who sends a message every 10 s for a long time] → the max wait forces a plan; the `dirty` flag starts the next turn.
- [Counter drift after a crash] → TTL on the counter, plus the max wait.
- [Two web instances] → the counter and the stamp are in Redis, the pending-rows check is in Postgres; nothing is per-process.
- [Inbound email shares the path] → same rules apply; the agent is WhatsApp-only today, so this is only kept consistent, not exercised.
- [A replan job fires for a client that went complete or paused] → `setFutureEmail` guards already return early.

## Migration Plan

No migration. Deploy web and worker together (the normal deploy does). Rollback = revert the commit; leftover `replan` jobs and `inbound:*` keys expire or are ignored. Add the two env vars to `.env.example`; both have defaults, so prod needs no config change.
