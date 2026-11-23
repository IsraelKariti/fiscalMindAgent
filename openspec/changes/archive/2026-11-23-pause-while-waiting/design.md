## Context

See proposal.md — Why. Observed today:

- The only pause control is inside the scheduled bubble (`Timeline.tsx`, the `pause-btn` next to "regenerate"); it is hidden when the draft is held for admin review. Resume lives on the paused bubble and on the "paused with nothing scheduled" notice.
- The workspace route `PUT /clients/:id/pause` already works with nothing scheduled: it sets `clients.paused`, then `pauseFutureEmail` finds no `scheduled_jobs` row and returns. Resume with no preserved row falls through to `removeFutureEmail` + `setFutureEmail('resume')`, which runs the planner (`resumeFutureEmail.ts`).
- While paused, `setFutureEmail` returns early ("client paused, not scheduling a follow-up"), so a queued after-send or turn re-plan schedules nothing. `sendEmailWorker` also skips a send for a paused client. Inbound messages and files are still stored and files still analyzed (the paused guard in `analyzeInboundFile.ts` only skips the processing stamp).
- `resolveTurnActivity` (`web/src/components/turnActivity.ts`) answers `null` for a paused client (unless a first draft is being held), which is what makes the paused notice with Resume show when nothing is scheduled.
- Staff viewers keep the conversation-flow controls: `Timeline` is rendered with `readOnly` only for a deleted client (`ClientView.tsx`), and the server allows pause for a viewer session (openspec `accountant-staff-access`).

## Goals / Non-Goals

**Goals:**
- One pause control reachable in every open-goal state, with the smallest UI change: a button in the timeline header row.
- Keep the timeline body unchanged while the agent waits (openspec `inbound-turn`: it ends at the last message).

**Non-Goals:**
- No change to what pause and resume do on the server.
- No pause control on the client list, the client header or the monday object.
- No "pause reason" or pause history.

## Decisions

1. **Header button, not a timeline row.** The `inbound-turn` spec forbids any row after the last message while the agent waits. The header row (toggles, message count, copy button) is always visible and already carries per-conversation actions, so the pause button goes there. Alternative rejected: a "waiting" row with a pause button, which would need a MODIFIED requirement in `inbound-turn` and clutter the quiet state.

2. **Show the header control only when no bubble carries one.** Rule, as a pure function `showHeaderPause({ readOnly, goalStatus, paused, nextScheduled })` in `turnActivity.ts` (or a sibling file) so it is unit-tested like `resolveTurnActivity`: `!readOnly && goalStatus === 'pending' && !paused && (nextScheduled == null || nextScheduled.heldAt != null) && !pendingReview`. When the scheduled draft is held for admin review, the bubble deliberately shows no pause (openspec `review-wait-visibility`); the header follows the same rule. Alternative rejected: always show the header control, which would duplicate the bubble's button.

3. **Reuse the bubble's handler and state.** The header button calls the same `togglePause(true)` and shares `pauseBusy` / `pauseError`, so the error banner and the disabled state behave as today. The label reuses `t.pauseSchedule` ("השהה") with a pause icon; a new `t.pauseConversationTitle` tooltip explains that the agent will send nothing until resumed.

4. **No server change.** Verified by reading the route and the orchestration (Context above). The pause flag is flipped before the client lock, so a planner run in flight re-plans into the paused state.

## Risks / Trade-offs

- [Pause pressed while the "failed" or "stuck" notice is shown] → `resolveTurnActivity` keeps answering `failed` for a paused client, so the failed notice with Retry stays instead of the paused notice. Retry on a paused client runs the planner, which schedules nothing. Acceptable: the accountant sees the client is paused in the header (the control is gone) and Retry is harmless. Document in the test; do not widen scope.
- [Resume drafts a message right away] → After a pause while waiting, resume runs the planner immediately instead of waiting out the after-send delay. The planner's own timing rules (openspec `reply-timing`) still decide when the message goes out, so the client is not spammed. Stated in the spec.
- [Two places to pause] → The header button and the bubble button are mutually exclusive by the rule in Decision 2, so only one is ever visible.

## Migration Plan

Front-end only; deploys with the next push. No rollback steps beyond reverting the commit.
