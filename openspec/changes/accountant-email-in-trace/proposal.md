## Why

When a client's documents are all collected, the agent emails the accountant ("all documents of X received"), and it emails the accountant in three other cases too (claimed documents, a document that failed verification, a passed due date). Today an admin cannot see what was sent: the trace row `email.accountant_sent` keeps only the recipient and the subject, a failed send leaves no row at all, and the delivery status lives only in the Resend dashboard. The admin has to leave the app to answer "did the accountant get the email, and what did it say?".

## What Changes

- Every accountant notification records its full content in its trace row: the kind of notification, the recipient, the subject, the body text and the provider's message id.
- A notification that could not be sent records a warning row of its own (`email.accountant_failed`) with the same content plus the error, so the trace shows the failure next to the step that caused it.
- In the client trace (workspace conversation tab under impersonation, and the admin viewer) the accountant-email rows get an envelope glyph and show the subject on the row.
- Opening an accountant-email row shows, in the existing step modal, the email as it was sent (recipient, subject, body in its own writing direction) and a delivery status badge read live from the mail provider (delivered, sent, bounced, failed, …). A row whose send was blocked by the sandbox fence says so; a row written before this change says the status is not available.
- A new admin-only route returns the delivery status of one accountant-email step.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `conversation-trace`: accountant-email rows carry the email content and a failure row; the step modal shows the email and its live delivery status.

## Impact

- `src/agents/declarationOfCapital/notifyAccountant.ts`: record body, kind and provider id; record the failure row.
- `src/audit/audit.ts`: new action `email.accountant_failed`.
- `src/api/llmAdmin.ts`, `src/api/router.ts`: new route `GET /api/admin/audit-events/:id/email-status` (admin session, step id).
- `src/resend/send.ts` (returns the provider id already) and a small status helper over the Resend `emails.get` call.
- `web/src/components/Timeline.tsx`, `StepDetailModal.tsx`, `stepSummary.ts`, `api.ts`, `i18n.tsx`, CSS: row glyph and subject, email section and status badge.
- `tests/stepSummary.test.ts`, a new status-mapping test, `docs/agents.md`, `docs/pipeline.md`.
- No database migration: the audit table already stores a free-form detail JSON.
