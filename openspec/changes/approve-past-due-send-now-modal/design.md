## Context

See proposal.md - Why. Current state, observed in code (master at 6a3a43f):

- The approve control lives in `web/src/components/Timeline.tsx`. It renders only when `pendingReview` is set, and `pendingReview` is derived from the admin conversation trace, which is fetched only when `isAdmin` is true (`ViewerProvider` in `App.tsx` sets `isAdmin` only for an admin in impersonation). So the admin-only gate already exists.
- Clicking the control opens the generic `ConfirmModal`. Its note text is chosen **at render time** by `pendingReview.status === 'held' || Date.parse(scheduledFor) <= Date.now()`. Because the modal element is only mounted after the click, the check does in fact run after the click, but nothing about the modal signals a warning: same title, same styling, and the past-due sentence is easy to miss.
- `ConfirmModal` already supports a `warning` prop (orange frame, warning icon), used elsewhere. CSS for `.modal-warning` exists in `web/src/styles.css`.
- `POST /admin/review/messages/:emailId/approve` (`src/api/reviewAdmin.ts`) re-enqueues a held draft to send at once and returns `sentImmediately`. The web client already types this response. `Timeline` ignores the flag today.
- The admin review queue page (`AdminReview.tsx`) has its own past-due banner (`reviewPastDue`) and a confirm note, both driven by the server's `pastDue` flag (status `held` only).
- Native browser popups are banned in this repo; all dialogs are in-app.

## Goals / Non-Goals

**Goals:**
- Make the past-due case unmistakable at click time: a distinct warning modal with its own title and note.
- Confirm the outcome after approval: show "sent immediately" feedback when the server reports it.
- Keep the admin-only gate and write it down as a spec requirement.

**Non-Goals:**
- No backend change. The past-due decision and the immediate re-enqueue already work.
- No change to how accountants see scheduled messages.
- No redesign of the admin review queue page beyond optionally reusing the warning styling.

## Decisions

1. **Reuse `ConfirmModal` with `warning: true` instead of a new modal component.**
   The component already has warning styling and a portal. A new component would duplicate it. Alternative considered: a new `ApproveNowModal` like `SendNowModal`. Rejected: nothing channel-specific is needed, and one modal keeps the UI consistent.

2. **Decide past-due at click time and store it in state.**
   On click, compute `pastDue = pendingReview.status === 'held' || Date.parse(nextScheduled.scheduledFor) <= Date.now()` and set `confirmingApprove` to `'now' | 'scheduled'` instead of a boolean. The modal then renders from that value. Alternative considered: keep computing in JSX at render time. Rejected: a re-render caused by an unrelated trace refresh could flip the modal's text under the admin's cursor; a value fixed at click time cannot.

3. **Use both signals for past-due.**
   The `held` status covers the case where the worker already parked the draft. The clock check covers the gap between the send time passing and the worker parking it, and the case where the page was loaded before the time passed. Alternative considered: server flag only (like the review queue page). Rejected: the timeline has the scheduled time at hand, and the gap would show the wrong modal.

4. **Show post-approval feedback from the server's `sentImmediately` flag, not from the client's guess.**
   The server is the source of truth for what actually happened. Feedback is a short, dismissable inline notice above the timeline (same slot as `approveError`), cleared on the next trace reload or when the scheduled block disappears. Alternative considered: a toast. Rejected: the repo has no toast primitive; an inline notice matches the existing error banner.

5. **New i18n strings, keep the old ones for the review queue page.**
   Add a warning title, a warning note, and a "sent immediately" feedback string. `approveDraftConfirmPastDue` becomes unused in the timeline and is removed; `reviewApproveConfirmPastDue` stays for `AdminReview.tsx`.

## Risks / Trade-offs

- [Client clock is wrong] → The `held` signal still catches drafts the worker parked; a clock skew of minutes only affects the narrow window before parking. Accepted.
- [Draft approved from the review queue page while the timeline modal is open] → The server answers 409; the existing `approveError` path shows it and the trace reloads. Existing behavior, unchanged.
- [The reported screenshot may have come from a stale GUI build] → Task list includes a live reproduction on the dev stack before coding, so the fix targets the real gap and the result is verified in the browser.
- [Two badges/notices stacking] → Feedback notice and error banner share one slot; only one is shown at a time.

## Migration Plan

Front-end only. Ships with the normal push-to-master sandbox deploy and manual prod promotion. No migration, no env change. Rollback = revert the commit.
