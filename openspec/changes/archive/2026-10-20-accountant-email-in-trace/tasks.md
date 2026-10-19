## 1. Record the email in full

- [x] 1.1 In `src/audit/audit.ts` add the action `email.accountant_failed` to the `AuditAction` union; verify `npm run typecheck` passes.
- [x] 1.2 In `src/agents/declarationOfCapital/notifyAccountant.ts` give `sendToAccountant` a `kind` argument (`goal_complete` | `claimed_documents` | `verification_problem` | `overdue`), pass it from the four senders, and record the `email.accountant_sent` row with `kind`, `to`, `subject`, `body` and `resendId` (the id `sendEmail` returns, including a `blocked-` stand-in); verify with a unit test that stubs `sendEmail` and `recordAudit` and asserts the recorded detail.
- [x] 1.3 In the same function catch a send error, record an `email.accountant_failed` row (severity `warning`, same `kind/to/subject/body` plus `error`), then rethrow; verify with a unit test that a throwing `sendEmail` yields the failure row and the error still propagates to the caller's existing catch.

## 2. Delivery status route

- [x] 2.1 Add `src/resend/deliveryStatus.ts` with a pure `emailDeliveryStatus(lastEvent)` mapping Resend's `last_event` to `delivered` | `pending` | `failed` as design.md decision 2 lists; verify with `tests/deliveryStatus.test.ts` covering every event word.
- [x] 2.2 In `src/api/llmAdmin.ts` add `adminGetStepEmailStatus`: load the step by id, 404 unless its action is `email.accountant_sent`, answer `{ status: 'blocked' }` for a `blocked-` id, `{ status: 'unavailable' }` when there is no `resendId` or the Resend call throws (warn log), else `{ status, event }` from `resend.emails.get`; mount it in `src/api/router.ts` as `GET /admin/audit-events/:id/email-status` behind `requireAdmin`; verify by calling the route with curl under an admin session for a sent row, an old row and a non-email step (200 / 200 unavailable / 404).

## 3. Trace row and modal

- [x] 3.1 In `web/src/components/stepLink.ts` add `isAccountantEmailStep(step)` (true for `email.accountant_sent` and `email.accountant_failed`); in `web/src/api.ts` add `adminGetStepEmailStatus(stepId)`; verify `npm run typecheck`.
- [x] 3.2 In `web/src/components/stepSummary.ts` add mappings for both actions producing rows `kind` (Hebrew wording per kind), `to`, `subject`, `body` and, for the failed row, `error`, with `clientName` dropped and old rows (no body) still rendering `to` and `subject`; verify with new cases in `tests/stepSummary.test.ts`.
- [x] 3.3 In `web/src/components/StepDetailModal.tsx` render, for an accountant-email step, a status badge above the summary: fetch on open for a sent row (loading text, then success/neutral/danger badge with the Hebrew label and the provider event word in mono), "blocked by the sandbox fence" muted for `blocked`, "status not available" muted for `unavailable` or a fetch error, and a danger "not sent" badge for a failed row with no fetch; give the `body` row a `pre-wrap` class in the CSS; add the Hebrew labels to `web/src/i18n.tsx` (`stepActionLabels` for both actions, `stepFieldLabels` for `kind`, `to`, `subject`, `body`, `error`, `resendId`, and the status words); verify in the browser under impersonation that a completed client's row opens the modal with the body and a badge.
- [x] 3.4 In `web/src/components/Timeline.tsx` give `email.accountant_*` rows the ✉️ glyph and show `detail.subject` in the muted slot; verify in the browser that the row reads "✉️ … email.accountant_sent כל המסמכים של … התקבלו" and that an accountant's own session shows no trace rows.

## 4. Docs and checks

- [x] 4.1 Update `docs/agents.md` (Collection lifecycle paragraph) and `docs/pipeline.md` (step row for `email.accountant_sent` / `email.accountant_failed` → `notifyAccountant.ts` · `sendToAccountant`) to describe the recorded content and the live status read; verify the text matches the built behaviour.
- [x] 4.2 Run `npm test` and `npm run typecheck`; verify both pass, then commit per the repo Git workflow.
