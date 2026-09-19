## Context

See proposal.md for the motivation. Current state, from the code:

- `planFollowUp` (`plan.ts`) makes one `generate_message` call that returns both the state changes (collected ids, file pairs, resolutions…) and the message. It applies the state, starts `verifyCollectedDocument` for each just-collected document as fire-and-forget (`void (async () => …)()`), and then stores and schedules the draft (`scheduleDraftMessage`).
- `verifyCollectedDocument` (`verifyDocument.ts`) ends every verdict (approved / reopened / stalled) with `replanAfterVerification`: audit `planner.rerun_after_verification`, then `withClientLock(removeFutureEmail + setFutureEmail(hints: { afterVerification: true }))`. It waits for the lock of the cycle that started it, then replaces that cycle's draft.
- The `afterVerification` hint only blocks collecting (`plan.ts` line ~412), so the follow-up cannot verify again.
- The planner reads verdicts from the document rows (status `approved`, or `pending` with the failure reasons in `verification`), so the follow-up cycle needs no new prompt input.
- Two actions of a cycle are bound to its draft: `setAttestationRequest(clientId, emailId)` and `applyTaxFetchAction(…, { emailId, delayMs })` (`client_agreed` moves a fetch session to `wa_intro_sent` on the assumption that this cycle's message is the intro).
- `taxFetch/deliver.ts` runs the same fire-and-forget loop for fetched documents, outside any planning cycle.
- Since `reply-after-full-turn`, inbound re-plans run in the `replan` worker under the client lock, and an inbound that arrives while the planner is active sets a dirty flag that re-runs the job.

## Goals / Non-Goals

**Goals:**
- One stored draft per collecting turn, written with the verdicts in view.
- One follow-up planning cycle per verification batch, on both paths (planner, fetch delivery).
- No lost reply when the process dies during verification.

**Non-Goals:**
- Splitting the planner into a "state" call and a "message" call. The collecting cycle still pays for a message it discards.
- Changing verification checks, verdicts, attempts, or accountant notifications.
- Changing `inbound-turn` rules.

## Decisions

### 1. Verify inline, inside the collecting cycle, under the same client lock
When `newlyCollected` has verification targets, `planFollowUp` awaits the batch and then calls itself once with `hints: { afterVerification: true }` and a freshly loaded client, instead of scheduling its draft.
*Why not keep the background task and only skip the draft:* the follow-up would depend on an untracked promise — a worker restart during verification would leave the client with no draft and nothing to recover it. Inline, the cycle is still the active `replan` job (or the manual redraft call): BullMQ re-runs a stalled job, `drafting_since` stays set for `recoverLostReplans`, and `setFutureEmail` records a failure for the manual retry.
*Cost:* the advisory lock is held for the verification time (about 10–30 s per document). Only the send worker and other planning cycles of the same client wait on it; there is no draft to send during that time. An inbound in that window sets the dirty flag and is planned right after.

### 2. `verifyCollectedDocument` returns an outcome and never re-plans
New return type: `'approved' | 'reopened' | 'stalled' | 'skipped'` (`skipped` = kill switch, row no longer `collected`, already stalled). `replanAfterVerification` is removed. A new helper `verifyBatch(client, instance, targets)` runs the targets one after the other, catches and logs an error per target (outcome `error`), and returns `{ documentId, name, outcome }[]`.

### 3. The follow-up cycle
- Planner path: after `verifyBatch`, record one `planner.rerun_after_verification` step whose detail lists every document with its outcome, then `return planFollowUp({ ...ctx, client: fresh, hints: { afterVerification: true } })`. Recursion depth is 1 by construction: the hint blocks collecting, so the second call has no targets.
- If every outcome is `skipped` because the kill switch is on, the follow-up still runs; the rows stay `collected` and the planner reports receipt without approval, as it does today when verification is skipped.
- Fetch delivery path: `verifyBatch`, then one locked `removeFutureEmail + setFutureEmail(hints)` — today's `replanAfterVerification`, once per batch, kept fire-and-forget because delivery must complete regardless.

### 4. What the collecting cycle skips
When the draft is withheld the cycle returns before: the `send_at` handling, `scheduleDraftMessage`, the `send_reply` step, `setAttestationRequest`, and `applyTaxFetchAction`. It also skips the `goal_complete` contract check (a collecting cycle cannot be complete — `collected` is not `approved` — and the follow-up decides again). Everything above that point in `plan.ts` is applied as today. A new audit step `withhold_reply` records `{ reason: 'awaiting_verification', documentIds, names }`, so the trail shows why a `generate_message` call has no `send_reply`.
*Alternative considered:* store the draft as `superseded` for the record. Rejected: `show-unsent-drafts-to-llm` would feed it back to the model as an unsent draft, and the timeline would show a message the agent never stood behind. The discarded text stays available in `llm_calls.response`.

### 5. Drafting state
No change needed for the replan worker and the manual redraft: `setFutureEmail` stamps `drafting_since` before `planFollowUp` and clears it after, and both cycles run inside that one call. During a long batch the stamp can pass the workspace's 3-minute "stale" limit, so `verifyBatch` re-stamps `markDraftingStarted` before each document.

## Risks / Trade-offs

- [The follow-up cycle does not repeat a message-bound action the first cycle proposed (fetch `client_agreed`, attestation request)] → it reads the same conversation and the same session state, so the same rules lead to the same proposal; an eval case covers "client agrees to a fetch and sends a file in one turn". The combination is rare: an attestation request needs every row settled, which a collecting cycle never has.
- [Reply latency grows by the verification time] → the reply was going to be replaced after that time anyway; the client now gets one correct message instead of a possibly wrong early one.
- [Lock held longer] → see decision 1; verification has its own timeouts and a thrown error is caught per document.
- [Tokens spent on a discarded message] → accepted (non-goal); the total number of planner calls per collecting turn still drops from 1+N to 2.
- [Tests that rely on the old order] → evals and unit tests call the stage functions, not `planFollowUp`; checked during implementation (task 1.1).

## Migration Plan

No migration, no config. Deploy as usual. Rollback = revert the commit. A client caught mid-verification by a deploy is recovered by the stalled-job re-run or `recoverLostReplans`.
