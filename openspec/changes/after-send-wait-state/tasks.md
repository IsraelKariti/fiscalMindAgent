## 1. Server: the due time of the after-send wait

- [x] 1.1 Add the pure helper `afterSendDueAt(job)` in `src/orchestration/inboundTurnCore.ts`: returns `job.timestamp + delay` as a Date when `replanKindOf(job.data) === 'after_send'` and the job state is one of the not-started states, else `null`. Extend `ReplanJobLike` with the `timestamp` and `opts.delay` fields it needs. Verify with new cases in `tests/inboundTurn.test.ts` (after-send job → due time; turn job → null; active job → null; no job → null).
- [x] 1.2 Add `afterSendWaitUntil(clientId)` in `src/orchestration/requestReplan.ts` that fetches `replan-<clientId>` from `replanQueue` and applies 1.1. Verify by typecheck and the unit test of 1.1 (the wrapper is one call).
- [x] 1.3 In `src/api/workspace.ts` GET `/clients/:id`, add `planWaitUntil` (ISO string or null) beside `nextScheduled`. Verify with `curl` on a local client right after a delivered send: the JSON carries a `planWaitUntil` one hour after the send; after the planner runs it is null.
- [x] 1.4 In `src/queue/sendEmailWorker.ts`, publish `publishClientUpdated(clientId)` once more after `requestReplanAfterSend` on the sent path, so the first refetch sees the wait. Verify by watching the local SSE stream (`npm run verify` skill) during a send: two client-updated events, the second after the job exists.

## 2. Web: the waiting state

- [x] 2.1 `web/src/api.ts`: add `planWaitUntil: string | null` to the client read response type; `web/src/agents/types.ts`: add `waitingAfterSend: boolean` to the agent context; pass it in `web/src/components/ClientView.tsx` and `web/src/agents/declarationOfCapital.tsx`. Verify with `npm run typecheck`.
- [x] 2.2 `ClientView.tsx`: compute `waitingAfterSend` (goal pending, not paused, nothing scheduled, not held, no drafting stamp, no failure stamp, `planWaitUntil` set) and exclude it from `drafting`, so `draftStale`/`draftFailed` cannot fire during the wait. Polling: slow interval during the wait plus one timer that refetches at `planWaitUntil + 1 s`. Verify by opening a local client inside the wait: no 3-second requests in the network tab, one refetch when the due time passes.
- [x] 2.3 (code done; browser check left to the owner — Docker/Redis was down in the apply session) `web/src/components/Timeline.tsx`: guard the held, failed/stuck and drafting bubbles with `!waitingAfterSend`; add no bubble, text or i18n string. Verify in the browser on a local client right after a delivered send: the timeline ends at the delivered message with no bubble and no Retry button; after three minutes still nothing; after the wait the drafting placeholder, then the scheduled bubble.
- [ ] 2.4 (live check, owner: needs the dev stack with Redis and a real WhatsApp send) Client reply inside the wait: send an inbound WhatsApp message (or the local mock) during the wait and verify the reply appears followed by the drafting placeholder of the turn, then the scheduled reply.

## 3. Docs and checks

- [x] 3.1 `docs/pipeline.md`: extend the after-send row with the workspace read (`api/workspace.ts` GET client → `requestReplan.ts · afterSendWaitUntil`) and the state it shows. Verify by reading the row.
- [x] 3.2 Run `npm run typecheck` and `npm test`; both pass.
- [ ] 3.3 Commit per the repo Git workflow (pull --rebase, typecheck, push).
