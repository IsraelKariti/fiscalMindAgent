## Context

See proposal.md — Why. One stamp, `clients.drafting_since`, is set by six kinds of code today: the inbound webhooks (turn start), the file analysis (`keepDrafting`), the replan worker's wait loop, the verification batch (`beforeEach`), `setFutureEmail` (the planner itself) and the manual redraft/regenerate routes. It only drives the page's "stuck" detection; the page decides "drafting" from `goal_status === 'pending' && !nextScheduled && !paused`. The unarchived change `after-send-wait-state` already serves `planWaitUntil` for a queued after-send run and hides every notice during it.

Three of the stamp's writers mean "analyzing inputs" (webhooks, file analysis, verification), two mean "writing the message" (planner, manual routes), and the wait loop means "waiting". `kickoffStartable` (`holdRule.ts`) and `isHeldFirstMessageClient` read `drafting_since` as "a planner attempt is in flight"; that meaning is kept.

## Goals / Non-Goals

**Goals:**
- Two stamps with one meaning each: `processing_since` = inputs being analyzed, `drafting_since` = planner run in flight.
- The page renders only from server facts (stamps, failure, hold, queued run), never from "nothing is scheduled".
- Stuck detection keeps working for both activities and for a lost run.

**Non-Goals:**
- A per-file progress display (which file is being classified).
- Changing when the planner runs, or the quiet-window rules.
- Changing the roster dot or the admin dashboards.

## Decisions

**A second column, not an enum.** `processing_since timestamptz NULL` (migration 080) beside `drafting_since`. New queries: `markProcessingStarted(id)` (sets `processing_since = now()`, clears `draft_failed_at`), `clearProcessing(id)`. `markDraftingStarted` now also clears `processing_since` (the planner takes over); `clearDraftingState` and `markDraftingFailed` clear both. Alternative considered: one `activity` enum plus one timestamp — rejected because every reader of `drafting_since` (recovery, kickoff hold rule, UI) would need rewriting; with two columns the planner meaning of `drafting_since` is unchanged.

**Who stamps what.**
- `onInboundWhatsApp.ts` / `onInboundEmail.ts` turn start → `markProcessingStarted` (was drafting). The function is renamed `cancelPendingSendAndShowProcessing`.
- `analyzeInboundFile.ts` `keepDrafting` → `keepProcessing` → `markProcessingStarted` per file.
- `replanWorker.ts` wait branch: when the wait is for work (`inflight > 0`, `pendingFiles > 0`, or held) → `markProcessingStarted`; when the wait is only the quiet window → `clearProcessing` (the page then shows nothing). The dirty re-run → `clearProcessing` too (the inbound that set dirty already stamped its own processing).
- `verifyDocument.ts` `verifyBatch` `beforeEach` → `markProcessingStarted`; `plan.ts` `verifyThenReplan` → `markDraftingStarted` after the batch, before `planFollowUp`.
- `setFutureEmail.ts` → `markDraftingStarted` (unchanged, now also clears processing). Manual redraft (`workspace.ts`) and regenerate (`reviewAdmin.ts`) unchanged.
- Kill-switch skip in the worker → `clearDraftingState` (clears both, unchanged call).

**Recovery reads both stamps.** `listDraftingWithoutSchedule` → `(drafting_since > … OR processing_since > …)`; `listDeliveredWithoutPlan` adds `processing_since IS NULL`.

**Queued run of any kind in the client read.** `afterSendDueAt(job)` becomes `replanDueAt(job)`: the due time of any not-started replan job (`timestamp + opts.delay`), and `afterSendWaitUntil` becomes `queuedReplanUntil`. The route keeps the field name `planWaitUntil`. For a turn job that the worker re-delays every 2 s the value is approximate; the page uses it only to know a run is queued and to schedule a refetch (SSE ticks cover the rest).

**Page state resolver, pure and tested.** `web/src/components/turnActivity.ts` exports `resolveTurnActivity(client, nextScheduled, planWaitUntil, lastActivityAt, now)` → `'held' | 'failed' | 'processing' | 'drafting' | 'stuck' | 'waiting' | 'idle' | null`, with the rules of the spec (3-minute stale limit on the newest stamp; "stuck" for a lost run after 3 minutes with no stamp, no queued run, no schedule; "waiting" when a run is queued). `ClientView.tsx` computes it once and passes `activity` to the agent context and `Timeline`; `drafting`/`draftFailed`/`draftStale`/`heldBySystem`/`waitingAfterSend` props collapse into `activity`. The paused-but-held-first-message case stays: a paused client with `drafting_since` set resolves to `drafting`. Fast poll (3 s) while processing or drafting, 15 s otherwise, plus the refetch timer at `planWaitUntil`.

**Texts.** i18n: `processingInputs: 'הסוכן מעבד כעת את ההודעות והקבצים שהתקבלו…'`; `draftingEmail` unchanged; stuck/failed/held unchanged.

**Timeline bubbles.** One block per state: held (existing), failed/stuck (existing, Retry), processing (new, same clock style as drafting), drafting (existing). The "goal open but nothing scheduled" inference is deleted.

## Risks / Trade-offs

- [A site that still stamps drafting for analysis] → grep `markDraftingStarted` at the end of the apply; only the planner, the manual routes and `verifyThenReplan` may call it.
- [Processing stamp left behind after a crash mid-analysis] → it goes stale after 3 minutes and the page shows stuck with Retry, as a stale drafting stamp does today; Retry clears both stamps via `markDraftingStarted`.
- [Page without the migration (older server)] → `processing_since` undefined on the row; the resolver treats it as null and the page shows nothing during analysis (never wrong, only quieter) until the deploy with 080.
- [Monday object view] → same `ClientView`, same behaviour; no separate change.

## Migration Plan

1. Migration 080 adds the nullable column; no backfill (a running turn at deploy time shows nothing instead of processing for its remaining seconds).
2. Deploy web + worker together as usual; production runs the migration in its deploy flow.
3. Rollback: revert the code; the extra column is harmless.
