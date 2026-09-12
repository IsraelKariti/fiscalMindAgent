## 1. Reproduce and pin down the gap

- [x] 1.1 On the running dev stack (user runs it), impersonate the accountant, open a client whose next scheduled message is awaiting review and whose send time has passed, click "אישור ההודעה", and record what the modal shows; verify the note by comparing to `approveDraftConfirmPastDue` in `web/src/i18n.tsx` and note whether the GUI build was current. Agree each browser step with the user first.
- [ ] 1.2 Log in as a plain accountant (no impersonation) and open the same client; verify the timeline shows no awaiting-approval badge and no approve control.

## 2. Timeline approve flow

- [x] 2.1 In `web/src/components/Timeline.tsx`, change `confirmingApprove` from boolean to `'scheduled' | 'now' | null`; on click compute past-due from `pendingReview.status === 'held'` or `Date.parse(nextScheduled.scheduledFor) <= Date.now()` and store the result; verify with `npm run typecheck`.
- [x] 2.2 Render the past-due case as `ConfirmModal` with `warning`, a dedicated title, and a note that says the send time passed and the message will be sent immediately; keep the non-warning modal with the planned time for the on-time case; verify in the browser that a past-due draft opens the orange warning modal and an on-time draft opens the plain one.
- [x] 2.3 Keep the `sentImmediately` flag from `api.adminApproveReviewMessage`, and show a dismissable inline notice in the `approveError` slot when it is true; clear it on the next trace reload; verify in the browser that confirming a past-due draft shows the notice and the message appears as sent.
- [x] 2.4 Cancel or click-outside closes the modal without calling the approve endpoint; verify in the browser network panel that no request is sent on cancel.

## 3. Strings

- [x] 3.1 In `web/src/i18n.tsx` add Hebrew strings for the warning title, warning note, and "sent immediately" feedback; remove `approveDraftConfirmPastDue` if no longer referenced; verify with `npm run typecheck` and a grep for the removed key.

## 4. Admin review queue page (optional styling only)

- [ ] 4.1 In `web/src/components/admin/AdminReview.tsx`, pass `warning: true` to the confirm props for the `pastDue` approve case so both pages look alike; verify in the browser on `#/review` with a held draft.

## 5. Verification and commit

- [x] 5.1 Run `npm run typecheck` and `npm test`; both pass.
- [ ] 5.2 Walk the four spec scenarios in the browser (past-due while page open, draft already parked, cancel, confirm) and the accountant-visibility scenario; all behave as the spec says.
- [x] 5.3 Commit per the repo Git workflow (pull --rebase, typecheck, commit with message file, push) and verify the push lands on master.
