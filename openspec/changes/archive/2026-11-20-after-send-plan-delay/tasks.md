## 1. Configuration

- [x] 1.1 Add `AFTER_SEND_PLAN_DELAY_SECONDS` (int, non-negative, default 3600) to `src/config/env.ts` with a comment, and document it in `.env.example` next to the INBOUND vars.

## 2. Re-plan job data and requesters

- [x] 2.1 Extend `ReplanJobData` in `src/orchestration/inboundTurnCore.ts` with `kind: 'turn' | 'after_send'` and `trigger: PlanTrigger`; `createReplanRequester` adds `kind: 'turn', trigger: 'client_message'` and inherits `turnStartedAt` only from an existing `kind === 'turn'` job.
- [x] 2.2 Add `createAfterSendReplanRequester({ queue, store, delayMs, now? })` in the same module: leave a not-started job, `setDirty` on an active one, otherwise add an `after_send` job with the delay (never below `MIN_DELAY_MS`).
- [x] 2.3 Export `requestReplanAfterSend` from `src/orchestration/requestReplan.ts` wired with `env.AFTER_SEND_PLAN_DELAY_SECONDS * 1000`.
- [x] 2.4 `src/queue/replanWorker.ts` · `onReplan` passes `job.data.trigger ?? 'client_message'` to `setFutureEmail` and treats missing `kind` as `'turn'`.

## 3. Send worker

- [x] 3.1 In `src/queue/sendEmailWorker.ts`, on outcome `'sent'` call `removeFutureEmail(clientId, 'send_settled')` then `requestReplanAfterSend(clientId)`; outcome `'not_sent'` keeps the inline `setFutureEmail(clientId, 'agent_message_sent')`.

## 4. Recovery

- [x] 4.1 Add `clients.listDeliveredWithoutPlan(delaySeconds)` in `src/db/queries/clients.ts` (goal pending, not paused, not deleted, no drafting/failed stamp, no `scheduled_jobs` row, latest outbound email `sent` within `delay + 1 day`), returning `{ id, sentAt }`.
- [x] 4.2 In `recoverLostReplans` (`src/queue/replanWorker.ts`), re-add an after-send job for each such client without a replan job, delay = remaining time (min 1 s); log the count.

## 5. Tests and docs

- [x] 5.1 `tests/inboundTurn.test.ts`: after-send request adds a job with the delay and trigger `agent_message_sent`; an inbound request inside the delay replaces it with the quiet delay, trigger `client_message` and a fresh turn start; an after-send request leaves a pending turn job untouched and only sets dirty on an active one.
- [x] 5.2 Add a row to `docs/pipeline.md` (section D, after the send row): "After a delivered send, the next plan waits the after-send delay" → `queue/sendEmailWorker.ts` · `onScheduledSend` → `orchestration/requestReplan.ts` · `requestReplanAfterSend`.
- [x] 5.3 `npm run typecheck` and `npm test` pass.

## 6. Deploy

- [x] 6.1 Set `AFTER_SEND_PLAN_DELAY_SECONDS=3600` on the production app settings of `fiscalmind-il-worker` and `fiscalmind-il-web` (owner confirms the value first).
