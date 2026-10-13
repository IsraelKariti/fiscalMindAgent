# Design

## Context

See proposal.md — Why. Today the review state of the scheduled draft reaches the browser only through the admin conversation trace (`adminGetClientConversation`, admin-only, fetched separately by `Timeline.tsx`), which drives both the "ממתינה לאישור" badge and the approve control. The accountant's client read (`GET /clients/:id`, `src/api/workspace.ts`) builds `nextScheduled` from the `scheduled_jobs` row and the draft row (`emails.getById`), but strips `review_status` and `held_at` (`workspaceSerialize.ts` does the same for thread messages). "Send now" (`sendFutureEmailNow`) checks only the queue state; the review gate lives in the worker (`onScheduledSend`), which holds the draft and returns, and `sendFutureEmailNow` then reports a held draft as `already_sending`. The 2026-10-13 commit `47d03e6` already made resume keep a held draft.

## Goals / Non-Goals

**Goals:**
- One source of truth for "waiting for the admin" that every viewer gets with the client read.
- No request that can only end in a held draft: refuse at the route, explain in the modal.
- Keep the approve control and the approval modals admin-only, untouched.

**Non-Goals:**
- Telling the accountant about the admin emergency pause (by design invisible).
- Changing the worker's gates, the review queue, or the alert emails.
- Showing the review state on thread messages (sent rows never carry it).

## Decisions

1. **Carry the state on `nextScheduled`, not on the trace.** Add `reviewPending: boolean` (draft `review_status === 'pending'`) and `heldAt: string | null` (draft `held_at` when `status === 'held'`) to the `nextScheduled` object in the client read and to `NextScheduled` in `web/src/api.ts`. The draft row is already loaded there, so no extra query. Alternative: make the accountant fetch a reduced trace — rejected, the trace is admin-only by design and much heavier.

2. **The badge and the note read `nextScheduled`; the approve control keeps reading the trace.** In `Timeline.tsx` the badge condition becomes `nextScheduled.reviewPending`; the approve button keeps `pendingReview` (trace-based, admin-only, needs the draft id). The scheduled note gets a third case next to paused and send-failed: held (`heldAt != null`) shows a Hebrew "time passed, waiting for the admin" note with the clock icon. Order of precedence: paused note wins (the badge is still shown next to it), then send-failed, then held, then the plain time.

3. **Refuse "send now" before touching the queue.** `sendFutureEmailNow` reads the draft (id from the job id, as the route already does) and returns a new result `awaiting_review` when `review_status === 'pending'` (covers both `draft` and `held` status); the route maps it to 409 with a Hebrew-ready error key. The check runs before the queue lookup so a stale page cannot promote the job. Alternative: let the worker keep holding and only fix the UI — rejected, a stale tab would still restamp the planned time to "now".

4. **Hide the control, keep the guard.** The "Send now" button of the scheduled bubble is rendered only when `nextScheduled.reviewPending` is false. `SendNowModal` keeps a `waitingForAdmin` prop and switches to the explanation with a single close button when the server answers 409 with `code: 'awaiting_review'`, which only a stale page can hit. No browser dialog. Alternative: show the button and explain on click — rejected on 2026-10-13, a control that can never act is noise once the badge says why.

5. **Paused keeps the badge.** The badge depends only on `reviewPending`, not on `paused`, so no extra logic; the resume modal wording is unchanged (a held draft is kept by resume, commit `47d03e6`).

6. **Hide pause on a held message, from `heldAt`.** In `Timeline.tsx` the pause button of the scheduled bubble is rendered only when `nextScheduled.heldAt` is null. No API change: a held draft is exactly the case where pausing has no effect on the send (the job already ran) and would only make the admin's approval answer 409. Alternative: hide pause whenever the planned time passed by the clock — rejected, a message a second past its time is still about to be sent by the worker, and pausing it is legitimate.

## Risks / Trade-offs

- [The accountant now learns that an admin reviews the messages] → accepted by the product owner on 2026-10-13; the badge names "admin approval" plainly, no mechanism is exposed.
- [Two sources for the same badge during rollout (trace vs. `nextScheduled`)] → the badge reads only `nextScheduled`; the trace keeps feeding the approve button only, so they cannot disagree on the badge.
- [Older GUI bundle against the new API] → the two fields are additive; an old bundle ignores them. A new bundle against an old API sees `undefined`, treated as false.
- [Send-now 409 on a draft the admin approves a second later] → the accountant reloads and sees the badge gone; acceptable.

## Migration Plan

Deploy with the normal push-to-master flow. No DB change. Rollback = revert the commit; nothing persisted changes shape.
