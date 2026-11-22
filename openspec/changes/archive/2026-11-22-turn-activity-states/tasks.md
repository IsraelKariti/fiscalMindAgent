## 1. Data: the second stamp

- [x] 1.1 (migration written; `npm run db:migrate` locally left to the owner — Docker was down) `migrations/080_client_processing_since.sql`: `ALTER TABLE clients ADD COLUMN processing_since TIMESTAMPTZ NULL` with a comment on its meaning. `src/db/types.ts`: `processing_since: Date | null` on `ClientRow`. Run `npm run db:migrate` locally; verify the column exists (`\d clients` via docker psql).
- [x] 1.2 `src/db/queries/clients.ts`: add `markProcessingStarted` (sets `processing_since = now()`, clears `draft_failed_at`) and `clearProcessing`; `markDraftingStarted` also clears `processing_since`; `clearDraftingState` and `markDraftingFailed` clear both. `listDraftingWithoutSchedule` matches either stamp; `listDeliveredWithoutPlan` also requires `processing_since IS NULL`. Verify with `npm run typecheck` and by reading the SQL.

## 2. Who stamps what

- [x] 2.1 `src/webhook/onInboundWhatsApp.ts` and `src/webhook/onInboundEmail.ts`: the turn start stamps processing (`markProcessingStarted`), function renamed `cancelPendingSendAndShowProcessing`. `src/agents/declarationOfCapital/analyzeInboundFile.ts`: `keepDrafting` → `keepProcessing` → `markProcessingStarted`. Verify by grep: no webhook or file-analysis code calls `markDraftingStarted`.
- [x] 2.2 `src/queue/replanWorker.ts` wait branch: processing when the wait is for work (in-flight, pending files, held), `clearProcessing` when only the quiet window remains; the dirty re-run clears processing. Verify with a unit test of the extracted decision helper (`waitKindOf(state)` in `inboundTurnRules.ts`: 'work' | 'quiet') in `tests/inboundTurn.test.ts`.
- [x] 2.3 `src/agents/declarationOfCapital/verifyDocument.ts` `verifyBatch` `beforeEach` → `markProcessingStarted`; `src/agents/declarationOfCapital/plan.ts` `verifyThenReplan` → `markDraftingStarted` after the batch, before `planFollowUp`. Verify by reading the diff and `npm test`.
- [x] 2.4 (verified: setFutureEmail.ts, workspace.ts, reviewAdmin.ts, plan.ts verifyThenReplan) Final grep: `markDraftingStarted` is called only from `setFutureEmail.ts`, `workspace.ts` (redraft), `reviewAdmin.ts` (regenerate), `plan.ts` (`verifyThenReplan`) and the worker's dirty re-run is gone from the list. Record the list in the task.

## 3. Queued run of any kind

- [x] 3.1 `src/orchestration/inboundTurnCore.ts`: `afterSendDueAt` → `replanDueAt` (any not-started replan job); `src/orchestration/requestReplan.ts`: `afterSendWaitUntil` → `queuedReplanUntil`; `src/api/workspace.ts` keeps serving `planWaitUntil`. Update `tests/inboundTurn.test.ts` (turn job now yields its due time; active job and no job still null). Suite passes.

## 4. Web: the activity resolver and the bubbles

- [x] 4.1 `web/src/components/turnActivity.ts`: pure `resolveTurnActivity(...)` per design.md (held, failed, processing, drafting, stuck, waiting, idle, null; 3-minute stale limit; stuck for a lost run after 3 minutes). New `tests/turnActivity.test.ts` covering: quiet window → waiting; processing fresh → processing; processing 4 min old → stuck; drafting → drafting; paused + drafting stamp (held first message) → drafting; failed → failed; outage → held; after-send wait → waiting; nothing queued for 4 min → stuck; nothing queued for 1 min → idle (nothing shown).
- [x] 4.2 `web/src/api.ts`: `processing_since` on `Client`. `web/src/components/ClientView.tsx`: compute `activity` with the resolver; polling 3 s while processing/drafting, 15 s otherwise; keep the refetch timer at `planWaitUntil`. `web/src/agents/types.ts` + `web/src/agents/declarationOfCapital.tsx`: pass `activity` instead of `drafting`/`draftFailed`/`draftStale`/`heldBySystem`/`waitingAfterSend`. `npm run typecheck` passes.
- [x] 4.3 (code done; browser check left to the owner) `web/src/components/Timeline.tsx`: take `activity`; render held / failed-or-stuck (Retry) / processing (new bubble, clock style) / drafting, nothing for waiting, idle or null; delete the "goal open but nothing scheduled" inference. `web/src/i18n.tsx`: `processingInputs`. Verify in the browser on a local client: send a text → nothing for the quiet window → drafting → scheduled reply; send a PDF → processing → drafting → reply; after the reply is sent → nothing.
- [ ] 4.4 (live check, owner) Retry from the stuck notice still works for both stale stamps (it calls the redraft route, which stamps drafting). Verify in the browser by forcing a stale processing stamp (`UPDATE clients SET processing_since = now() - interval '5 minutes'` via docker psql) and pressing Retry.

## 5. Docs and checks

- [x] 5.1 `docs/pipeline.md`: the turn rows name the stamps (processing at the webhook and file analysis, drafting at the planner, nothing in the quiet window); `docs/agents.md` if it describes the drafting placeholder. Verify by reading.
- [x] 5.2 `npm run typecheck`, `npm test`, commit per the repo Git workflow.
