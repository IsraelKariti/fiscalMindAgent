## 1. Turn state and settle rule

- [x] 1.1 Add `INBOUND_QUIET_SECONDS` (default 15) and `INBOUND_MAX_WAIT_SECONDS` (default 300) to `src/config/env.ts` and `.env.example`; verify `npm run typecheck` passes
- [x] 1.2 Add `src/orchestration/inboundTurn.ts` with the Redis helpers (`markInboundStarted`, `markInboundFinished`, `readTurnState`, dirty flag) using the `inbound:{<clientId>}:*` keys and the TTL from design decision 2; verify with a unit test that uses a fake Redis client
- [x] 1.3 Add the pure function `isTurnSettled` (in-flight count, last inbound stamp, pending file rows, quiet window) and `tests/inboundTurn.test.ts` covering: in flight, inside the quiet window, pending file row, settled; verify `npm test` passes
- [x] 1.4 Add `documentFiles.countRecentPendingForClient(clientId, sinceSeconds)`; verify the query against the local DB with one pending and one done row

## 2. Deferred re-plan job

- [x] 2.1 Add `src/queue/replanQueue.ts` (queue `replan`, job id `replan-<clientId>`) and `src/orchestration/requestReplan.ts` (remove waiting job + re-add with the quiet delay, keep the earliest `turnStartedAt`, set the dirty flag when the job is active); verify with a unit test that two calls leave one job with the later fire time
- [x] 2.2 Add `src/queue/replanWorker.ts`: run the settle check, look again after 2 s while not settled, force the plan and log a warning after the max wait, otherwise run `removeFutureEmail` + `setFutureEmail` under `withClientLock`; clear `drafting_since` when `setFutureEmail` returns early; honor the dirty flag after the plan. Verify with a unit test of the decision branch (settled / not settled / max wait)
- [x] 2.3 Register the worker in `src/worker.ts` with shutdown handling; verify the worker log prints `replan worker started`
- [x] 2.4 Add boot recovery next to `resyncScheduledJobs`: clients with `drafting_since` set, no `scheduled_jobs` row and no `replan` job get `requestReplan`; verify by setting `drafting_since` on a local test client, restarting the worker, and seeing one planner run

## 3. Webhook hand-off

- [x] 3.1 `src/webhook/onInboundWhatsApp.ts`: wrap the work after the client lookup in the in-flight marker (`try/finally`), stamp the last inbound time, call `markDraftingStarted` after the immediate `removeFutureEmail`; verify the counter returns to 0 after a webhook, also when media ingestion throws
- [x] 3.2 `src/webhook/onInboundEmail.ts`: same change; verify `npm run typecheck` passes
- [x] 3.3 `src/agents/declarationOfCapital/index.ts`: keep the OTP early return and `screenInboundMessage`, replace the locked `removeFutureEmail + setFutureEmail` with `requestReplan`; verify the OTP path requests no replan (unit test or log check)

## 4. Docs and end-to-end check

- [x] 4.1 Update the inbound flow section of `docs/agents.md` (turn, quiet window, max wait, fast paths); verify the text matches `specs/inbound-turn/spec.md`
- [x] 4.2 End-to-end on the local stack (user runs `npm run dev`; use the `verify` skill): post one text webhook and three media webhooks for a test client within 5 s; verify the `llm_calls` log shows exactly one planner call for the turn, made after the last `validate_classification` audit row, and the workspace shows "drafting" during the wait
- [x] 4.3 End-to-end: post a multi-document PDF; verify the planner call comes after every split child has an analysis result
- [x] 4.4 Run `npm run typecheck` and `npm test`; verify both pass
