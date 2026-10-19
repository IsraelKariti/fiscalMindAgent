## Context

See proposal.md for motivation. What exists today:

- All four accountant notifications go through one function, `sendToAccountant` in `notifyAccountant.ts`, which calls `sendEmail` (Resend) and then records the audit row `email.accountant_sent` with `{ clientName, to, subject }`. Callers fire and forget and only log a failure; a failed send leaves no row.
- `sendEmail` already returns the Resend id (`resendId`), or a `blocked-<uuid>` stand-in when `OUTBOUND_ALLOWLIST` blocked the recipient.
- `audit_events` is append-only (migration 031 trigger), so a row can never be updated with a later delivery status.
- The admin conversation endpoint already returns every audit row of the client, and `Timeline.tsx` renders each one as a `StepRow` that opens `StepDetailModal`. The modal renders `detail` through `stepSummaryOf` (pure mapping per action, unit-tested) and falls back to generic key/value rows.
- The Resend SDK's `emails.get(id)` returns `last_event` (`delivered`, `sent`, `queued`, `bounced`, `failed`, `complained`, `suppressed`, `delivery_delayed`, `opened`, `clicked`, `canceled`, `scheduled`). No Resend webhook for delivery events is configured; the existing webhook handles inbound mail only.

## Goals / Non-Goals

**Goals:**
- One place records every accountant email with its content; the trace is the record.
- Delivery status without a new table and without touching the append-only audit rows.
- Reuse the step modal, the step link page and the copy-details text as they are.

**Non-Goals:**
- Storing accountant emails in the `emails` table (that table is the client conversation and feeds the LLM transcript).
- Delivery-event webhooks from Resend, or a status history. One live read on modal open is enough.
- Showing these emails to accountants, or a resend button.
- Changing the email texts.

## Decisions

1. **Content goes into the audit detail at send time; status is read live.**
   The row gains `kind` (`goal_complete` | `claimed_documents` | `verification_problem` | `overdue`), `body` and `resendId`. The status is never stored: the modal asks `GET /api/admin/audit-events/:id/email-status`, which loads the step, checks its action is `email.accountant_sent`, and calls `resend.emails.get(detail.resendId)`.
   *Alternative rejected:* a `notification_emails` table with a webhook-updated status column. More moving parts (migration, webhook event types, Svix config in prod) for a status an admin reads a few times a month.

2. **The status route maps Resend's `last_event` to a small view status.**
   A pure helper `emailDeliveryStatus(lastEvent)` in `src/resend/deliveryStatus.ts` returns `{ status: 'delivered' | 'pending' | 'failed', event }`; `opened`/`clicked` count as delivered, `queued`/`sent`/`scheduled`/`delivery_delayed` as pending, the rest as failed. The route answers `{ status, event }`, or `{ status: 'blocked' }` for a `blocked-` id (no provider call), or `{ status: 'unavailable' }` when the row has no `resendId` or the provider call throws (logged at warn). Keeping the mapping pure makes it unit-testable without the SDK.

3. **A failed send records its own row, `email.accountant_failed`, inside `sendToAccountant`.**
   The function catches the send error, records the warning row with the same `kind/to/subject/body` plus `error`, and rethrows so callers keep their existing log line. The failure row has no `resendId`, so the modal never asks the provider for it.

4. **Modal rendering stays inside the existing pieces.**
   `stepSummary.ts` gets a mapping for both actions producing rows `kind` (Hebrew words), `to`, `subject`, `body` (and `error`); the modal adds a `white-space: pre-wrap` class on the `body` row so line breaks survive. The status badge is a small block above the summary that `StepDetailModal` renders only when `isAccountantEmailStep(step)` (a helper in `stepLink.ts` beside `isFileStep`), fetching through a new `api.adminGetStepEmailStatus`. The row glyph in `Timeline.tsx` becomes ✉️ for `email.accountant_*`, and the row's muted text shows `detail.subject` (the slot that shows `reason` today).

5. **Old rows degrade.** A row without `body` shows only `to` and `subject`; a row without `resendId` gets the "unavailable" badge. No backfill.

## Risks / Trade-offs

- [Resend `emails.get` is rate-limited and takes ~300 ms] → one call per modal open, admin-only, no polling.
- [`last_event` can lag right after send (Resend indexes asynchronously)] → the badge shows "pending"; reopening the modal re-reads.
- [The body is Hebrew with line breaks inside JSON detail] → the raw JSON section already renders it escaped; the summary row uses `pre-wrap` and `dir="auto"`.
- [Fence-blocked sends in the sandbox look like real sends in the trace] → the explicit "blocked by the sandbox fence" badge, derived from the `blocked-` id prefix.
- [`sendToAccountant` now records a second audit action] → `audit.ts` union gains `email.accountant_failed`; `tests/audit.test.ts` covers the union shape only.

## Migration Plan

No migration. Deploy code; new rows carry the new fields from the first send after deploy. Rollback = redeploy the previous image; the extra detail keys are ignored by the old UI.
