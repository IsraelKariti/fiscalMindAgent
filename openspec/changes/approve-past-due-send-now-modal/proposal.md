## Why

An admin who impersonates an accountant sees the "אישור ההודעה" (approve message) button on a review-pending draft in the workspace timeline. When the draft's planned send time has already passed, approving it sends the message right away, not at the planned time. Today the click opens the generic confirm modal and the only hint is a changed sentence in its note; in the reported case (screenshot, 2026-09-12) no such notice was seen at all. The admin must be told clearly, before confirming, that the message will go out immediately.

## What Changes

- Approving a review-pending draft from the workspace timeline after its send time has passed opens a dedicated **warning** modal (in-app, styled, never a browser popup) that states the message will be sent immediately on approval, and asks for confirmation.
- "Past due" is decided by either signal: the draft is already parked as `held` by the worker, or the planned send time is not later than the viewer's clock. The check runs at click time, not at render time, so a page left open still gets the warning.
- Approving before the send time keeps the current, non-warning confirm modal that names the planned send time.
- After a past-due approval succeeds, the timeline shows short feedback that the message was sent immediately (the endpoint already returns `sentImmediately`).
- The approve control stays **admin-only**: it renders only for an admin viewing a workspace through impersonation. Accountants never see it. This is existing behavior, now written down as a requirement.
- The admin review queue page (`#/review`) keeps its own past-due banner and confirm note unchanged. Its modal may reuse the same warning styling; no other change there.

## Capabilities

### New Capabilities
- `admin-message-review`: admin-only review and approval of agent drafts held for review, covering who may see the approve control in the workspace timeline and what the admin is told before a past-due approval.

### Modified Capabilities
<!-- none: openspec/specs/ is empty; this is the first spec for this area -->

## Impact

- `web/src/components/Timeline.tsx`: approve button and its confirm modal (past-due detection at click time, warning modal, post-approve feedback).
- `web/src/components/ConfirmModal.tsx`: already supports `warning`; reused, no API change expected.
- `web/src/i18n.tsx`: new or reworded Hebrew strings for the warning modal title, note, and "sent immediately" feedback.
- `web/src/components/admin/AdminReview.tsx`: optional switch to the warning styling for the past-due case.
- Backend: no change. `POST /api/admin/review/messages/:emailId/approve` already re-enqueues a held draft and answers `sentImmediately`.
- No migration, no new env vars, no API contract change.
