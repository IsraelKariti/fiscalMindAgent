# Proposal

## Why

When an agent instance is in review mode, a scheduled message cannot go out until the admin approves it. Today the accountant's timeline gives no sign of that: the bubble looks like a normal scheduled message, "Send now" promotes the queue job, the worker holds the draft instead of sending, the API answers "ok", the modal closes, and the bubble simply shows the current time. The accountant sees a message that never sends and a button that does nothing (found on 2026-10-13 on a live pilot client). The impersonating admin is better off only in theory: the badge and approve control exist, but they depend on a separate trace fetch and were absent on the same screen.

## What Changes

- **The scheduled message carries its review state.** The workspace's "next scheduled" payload says whether the draft awaits admin approval, and whether the planned time already passed without approval (the worker held it). Every viewer of the timeline, accountant and impersonating admin alike, gets the same answer from the same request, with no dependency on the admin trace.
- **The timeline shows that the message waits for the admin.** The scheduled bubble carries an "awaiting admin approval" badge whenever the draft is pending, in both cases: the planned time is still ahead, or the time passed and the worker held the message. When the time passed, the note under the bubble says so in plain words instead of showing a time that looks like a future send. **BREAKING** for the `admin-message-review` rule that the accountant never sees the awaiting-approval badge: the badge is now shown to the accountant too. The approve control and the approval modals stay admin-only.
- **No "Send now" on a message that waits for the admin.** While the draft awaits approval (time ahead or already held), the bubble offers no "שלח עכשיו" control; the badge explains the state. The send-now route still refuses such a request with a clear error, and a stale page that shows the control gets an explaining modal instead of a send, so nothing promotes a job that cannot send.
- **No pause on a held message.** Once the worker held the message (its planned time passed without approval), the bubble offers no "השהה" (pause) control: the message is already stopped, and pausing would only block the admin's approval. "Regenerate" stays. The pause control stays on a scheduled message whose time is still ahead.
- **Resume keeps the badge.** A paused client whose kept draft awaits approval shows the badge too, so the accountant knows that resuming will not send by itself.

Out of scope: letting the accountant approve, changing the admin review queue, the admin emergency pause (its sends are swallowed on purpose and stay invisible), and any email or WhatsApp notification to the accountant.

## Capabilities

### New Capabilities

- `review-wait-visibility`: what the workspace tells any viewer about a scheduled message that waits for admin approval, and how "Send now" and resume behave on such a message.

### Modified Capabilities

- `admin-message-review`: the requirement "Approve control is visible only to impersonating admins" keeps the control and the modals admin-only, but no longer hides the awaiting-approval badge from the accountant.

## Impact

- `src/api/workspace.ts` — the client read adds `reviewPending` and `heldAt` to `nextScheduled` (from the draft's `review_status` and `status`); the send-now route answers 409 when the draft awaits approval.
- `src/orchestration/sendFutureEmailNow.ts` — a new result `awaiting_review` returned before any queue work when the draft is pending or held.
- `web/src/api.ts` — `NextScheduled` gains the two fields. `web/src/components/Timeline.tsx` — the badge and the past-due note come from `nextScheduled`, not from the admin trace; the approve control keeps using the trace. `web/src/components/SendNowModal.tsx` — a waiting-for-admin variant with no send button. `web/src/i18n.tsx` — the new strings.
- `tests/` — unit tests for the send-now decision and the payload fields.
- `docs/agents.md` (workspace API shape), `docs/pipeline.md` (send now row). No migration.
