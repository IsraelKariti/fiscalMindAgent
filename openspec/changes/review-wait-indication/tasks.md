# Tasks

## 1. API: review state on the scheduled message

- [ ] 1.1 In `src/api/workspace.ts` (`GET /clients/:id`), add `reviewPending` (draft `review_status === 'pending'`) and `heldAt` (draft `held_at` when `status === 'held'`, else null) to `nextScheduled`; document the two fields in `docs/agents.md` next to the workspace API shape.
- [ ] 1.2 In `src/orchestration/sendFutureEmailNow.ts`, read the draft from the job id before any queue lookup and return a new `SendNowResult` `'awaiting_review'` when the draft awaits approval (pending, held or not); keep every other path unchanged.
- [ ] 1.3 In the send-now route, map `'awaiting_review'` to 409 with the error "The message is waiting for the admin's approval — it is sent after the approval."; update the send-now row in `docs/pipeline.md`.
- [ ] 1.4 Unit test (`tests/sendNowDecision.test.ts` or next to the existing send tests): the awaiting-review answer for a pending draft, a held draft, and an approved draft; the `nextScheduled` field mapping for the three cases.

## 2. GUI: badge, note and modal

- [ ] 2.1 In `web/src/api.ts`, add `reviewPending: boolean` and `heldAt: string | null` to `NextScheduled`.
- [ ] 2.2 In `web/src/i18n.tsx`, add the Hebrew strings: the badge text for every viewer ("ממתינה לאישור מנהל"), the held note ("הזמן המתוכנן עבר — ההודעה ממתינה לאישור המנהל"), the send-now waiting explanation and its close label, and the 409 error text.
- [ ] 2.3 In `web/src/components/Timeline.tsx`, show the badge from `nextScheduled.reviewPending` for every viewer (also while paused); keep the approve control on the trace-based `pendingReview` for admins only; add the held note case to the scheduled note (precedence: paused, send-failed, held, time).
- [ ] 2.4 In `web/src/components/SendNowModal.tsx`, add a `waitingForAdmin` prop: when true, render the explanation and a single close button, no send; `Timeline.tsx` passes `nextScheduled.reviewPending`.
- [ ] 2.5 Run `npm run typecheck` and `npm run lint` (web); check the bubble in both the accountant view and the admin view-as on a review-mode client: pending with time ahead, held after the time, paused with a pending draft, and send now on each.

## 3. Docs and wrap-up

- [ ] 3.1 Update the Notion feature page "Agent Messages" (Rules tab: send now card; Status tile back to gray) and the "Agent Message Flow" artifact: the send-now click on a pending or held draft shows a refusal with a clear message instead of "nothing".
- [ ] 3.2 Commit per the Git workflow (pull --rebase, typecheck, push).
