## Context

See proposal.md — Why. Today the only facts the client read gives the web are the client row (`drafting_since`, `draft_failed_at`, `outage_held_at`, `paused`, `goal_status`) and `nextScheduled`. The web derives "drafting" from "goal open and nothing scheduled" and "stuck" from "drafting for more than 3 minutes since the last timeline activity". The after-send wait (`createAfterSendReplanRequester`) lives only in Redis: one delayed BullMQ job `replan-<clientId>` with `kind: 'after_send'`, whose due time is `job.timestamp + job.opts.delay`. No row in Postgres records the wait; the boot recovery (`recoverLostReplans`) rebuilds it from the last delivered outbound.

The web process already owns the replan queue (`requestReplan.ts` is called from the inbound webhooks), so the workspace API can read the job.

## Goals / Non-Goals

**Goals:**
- One truthful source for "the agent is waiting on purpose": the queued run itself.
- Silence in the timeline during the wait: it ends at the delivered message, with no false "drafting" or "stuck".
- Same state for every viewer of the client (one route serves them all).

**Non-Goals:**
- Persisting the wait in Postgres (a new column plus set/clear bookkeeping in three places).
- Showing the wait in the roster, the client dot, or the admin dashboards.
- Changing what happens when the wait was lost with Redis (boot recovery stays the fix).
- Letting the accountant shorten or skip the wait (Retry/"send now" semantics are unchanged).

## Decisions

**Read the due time from the queued job, not from a new column.** The GET client route calls a small helper (`afterSendWaitUntil(clientId)` next to `requestReplanAfterSend`, built on a pure `afterSendDueAt(job)` in `inboundTurnCore.ts`) that fetches `replan-<clientId>`, and returns `timestamp + delay` as a Date only when the job's kind is `after_send` and its state is one of the not-started states; otherwise `null`. The route adds `planWaitUntil: string | null` beside `nextScheduled` (it is a derived fact of the read, like `nextScheduled`, not a client column). Alternative considered: a `plan_wait_until` column set by the send worker and cleared by the replan worker and the inbound requester — rejected, it duplicates the queue and can drift (a reply replaces the job but the column would need its own clear).

**The web treats the wait as a silent state, before drafting.** In `ClientView.tsx`: `waitingAfterSend = goal pending && !paused && !nextScheduled && !heldBySystem && drafting_since == null && draft_failed_at == null && planWaitUntil != null`. `drafting` becomes `… && !waitingAfterSend`, so `draftStale` and `draftFailed` cannot fire during the wait. The agent context (`web/src/agents/types.ts`) carries `waitingAfterSend` and `Timeline.tsx` renders nothing for it: the three existing bubbles (held, failed/stuck, drafting) are each guarded with `!waitingAfterSend`, and no new bubble, text or i18n string is added. The due time stays server-side data used only for the refetch timer below; it is never shown.

**Polling.** During the wait the view polls every 15 s (the slow interval) and sets one timer for `planWaitUntil − now + 1 s` that refetches, so the drafting placeholder appears as soon as the run starts. No 3 s poll for an hour.

**Event order in the send worker.** `removeFutureEmail(…, 'send_settled')` publishes the client-updated event before `requestReplanAfterSend` queues the wait, so a page that refetches on that event can still read "no job" and show drafting for one refresh. After `requestReplanAfterSend` the worker publishes `publishClientUpdated(clientId)` once more.

**Older viewers.** A web build without the field keeps today's behaviour; the field is additive.

## Risks / Trade-offs

- [Redis read on every client GET] → one `getJob` per read; the route already does a Postgres read for the scheduled job, and client reads are per-page, not per-roster.
- [Job lost with Redis before boot recovery] → the read carries no due time and the page falls back to drafting → stuck with Retry, exactly as today; recovery on the next worker boot re-adds the wait. Documented in the spec scenario.
- [Wait due but the worker has not picked the job up yet (busy)] → the timeline stays silent for at most one slow-poll interval, then the drafting stamp brings the placeholder. Acceptable.
- [Clock skew between server and browser] → the due time is computed on the server from the job's own timestamp; the browser only schedules a refetch from it, so skew shifts the refetch by at most the skew, never the state.
- [Accountant cannot tell "waiting on purpose" from "idle"] → accepted by the owner: the wait is short (one hour by default) and the next message appears by itself; the rest of the page (last message, documents) is unchanged.
