## Context

`sendEmailWorker.ts` ends a delivered send with `removeFutureEmail` + `setFutureEmail(clientId, 'agent_message_sent')`, which runs the planner inline. Inbound webhooks instead call `requestReplan` (`inboundTurnCore.ts` · `createReplanRequester`), which keeps ONE BullMQ job `replan-<clientId>` and lets `replanWorker.ts` · `onReplan` plan under the turn rules. Production sets `INBOUND_QUIET_SECONDS=125`.

## Goals / Non-Goals

Goals: defer the after-send plan by a configured delay; keep one planner run when a reply lands inside it; survive Redis loss; keep `plan_trigger` correct.
Non-goals: any workspace UI for the waiting state; changing what the planner decides; the not-sent path.

## Decisions

1. **Reuse the replan job, not a new queue.** The after-send run is added as the same job id `replan-<clientId>` with `delay = AFTER_SEND_PLAN_DELAY_SECONDS * 1000`. A reply inside the delay goes through `requestReplan`, which already removes a not-started job and re-adds it with the quiet delay, so the two triggers merge into one run for free.

2. **Job data gains `kind` and `trigger`.** `ReplanJobData` becomes `{ clientId, turnStartedAt, kind: 'turn' | 'after_send', trigger: PlanTrigger }`. `onReplan` passes `job.data.trigger` to `setFutureEmail` (today hard-coded `'client_message'`). Old jobs without the fields are read as `kind: 'turn'`, `trigger: 'client_message'`.

3. **An inbound request never inherits an after-send turn start.** In `createReplanRequester`, `turnStartedAt = existing.data.turnStartedAt` only when `existing.data.kind === 'turn'`. Otherwise the max wait would count from the send time and the reply would be force-planned at once with a warning.

4. **New requester `requestReplanAfterSend(clientId)`** (same module, built by a sibling factory `createAfterSendReplanRequester` with `delayMs`): if a job exists and is not started → leave it (a pending turn fires sooner and plans the same state); if active → `setDirty` (the running plan may predate the send; `takeDirty` re-runs it after the quiet window); otherwise add `{ kind: 'after_send', trigger: 'agent_message_sent', turnStartedAt: now }` with the after-send delay. `sendEmailWorker` calls it on the `'sent'` outcome only; `'not_sent'` keeps the inline `setFutureEmail`.

5. **Recovery without a migration.** `recoverLostReplans` also runs a new query `clients.listDeliveredWithoutPlan(delaySeconds)`: goal pending, not paused, not deleted, `drafting_since IS NULL`, `draft_failed_at IS NULL`, no `scheduled_jobs` row, and the latest outbound `emails` row has `status='sent'` with `sent_at > now() - delay - 1 day` (bounded so an ancient idle row is not resurrected forever). For each, if no replan job exists, add an after-send job with `delay = max(1s, sent_at + delay - now)`. Paused/admin-paused clients are harmless if matched: `setFutureEmail` returns early.

6. **Env.** `AFTER_SEND_PLAN_DELAY_SECONDS: z.coerce.number().int().nonnegative().default(3600)` in `env.ts`; `0` means "at once" (today's behaviour, for local testing). Documented in `.env.example` next to the INBOUND vars. Production: set on `fiscalmind-il-web` and `fiscalmind-il-worker` app settings (worker runs the queue; web only for symmetry with the INBOUND vars).

## Risks / Trade-offs

- During the delay the workspace shows neither a scheduled bubble nor "drafting". Accepted by the owner; a later change can add a "next plan at" hint.
- The earliest possible reminder becomes send + delay. The planner has never chosen one sooner than hours later.
- The recovery query is a heuristic over `emails`; it is bounded by time and guarded by `setFutureEmail`'s own early returns, so a false match costs one planner run at most.

## Open Questions

None.
