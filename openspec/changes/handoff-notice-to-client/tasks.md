## 1. Template purpose `handoff`

- [x] 1.1 Add a migration that widens the `wa_templates.purpose` CHECK to `intro`, `reopen`, `handoff`; verify `npm run db:migrate` passes and inserting a `handoff` row by hand succeeds
- [x] 1.2 Add `handoff` to `WaTemplatePurpose` (`src/db/types.ts`) and to the register route's validation (`src/api/waAdmin.ts`) and the admin template form's purpose choices; verify `npm run typecheck` passes and a template can be registered with purpose `handoff` from the admin screen
- [x] 1.3 Make `splitTemplatesByPurpose` drop `handoff` templates (not offered, not listed as hidden) and add unit tests: a `handoff` row never appears in either list, before or after first contact; verify `npm test` passes
- [x] 1.4 Add a test that the "no usable template" reason still names `reopen` when only an intro and a handoff template are registered, and that a planner answer naming the handoff SID is rejected by the gate; verify `npm test` passes

## 2. Notice content (pure functions)

- [x] 2.1 Create `src/agents/declarationOfCapital/handoffNotice.ts` with `handoffNoticeAdvisor(client, accountant)`: stored advisor when it has an email, otherwise the accountant's display name and email; unit tests for advisor on file, no advisor, advisor without email
- [x] 2.2 Add `handoffNoticeVariables(client, accountant)` (first name, advisor name, advisor email) and the rendered body from the template row's text; unit test with a sample template body checks the three values land in order
- [x] 2.3 Add `handoffNoticeDelivery(client, sender, template)` returning send data or a skip reason (no number, no sender, no handoff template); unit tests for each reason

## 3. Business-day test

- [x] 3.1 Export `isBlockedDay` from `src/agents/shared/sendAtGuard.ts` and add `isBlockedLocalDate(now, timeZone)`; unit tests: Friday, Saturday, a chag, an erev chag are blocked, an ordinary Sunday is not, and 23:30 UTC on Thursday counts as Friday in Israel

## 4. Queries

- [x] 4.1 Add `clients.listHandoffNoticeDue(agentTypes, sinceIso)` per design.md (paused, pending, not deleted, `overdue_stopped_at >= sinceIso`, no `handoff_notice_sent_at`); verify with a query test or a local run against seeded rows that a resumed client, a declined client, a completed client and a client stopped 8 days ago are not returned
- [x] 4.2 Add `clients.claimHandoffNotice(id)` (conditional stamp, returns the row or null) and `clients.releaseHandoffNotice(id)`; verify a second claim on the same client returns null
- [x] 4.3 Make the set-due-date query also remove `handoff_notice_sent_at`; verify setting a new due date on a notified client clears the marker and resume leaves it

## 5. Send and record

- [x] 5.1 Add `sendWhatsAppTemplateAndRecord` to `src/twilio/sendAndRecord.ts` (outbound row with rendered body, content SID and variables; send; mark sent; `wa.template_sent` audit); verify with a unit test using a stubbed sender that the row is marked sent and the audit is recorded
- [x] 5.2 Add `sendHandoffNotice(client, now)` in the agent folder: under `withClientLock`, skip on admin pause, resolve delivery, claim, send, release the claim and clean the failed draft on a provider error, publish the client update; unit tests with injected deps for sent, skipped (each reason), and failed-then-released
- [x] 5.3 Add `runHandoffNoticeScan()`: return when the kill switch is on or today is a blocked day, list due clients (7 days back), call `sendHandoffNotice` for each, log the counts; unit test that a blocked day sends nothing and an allowed day calls the sender once per due client

## 6. Scheduling

- [x] 6.1 Register the `handoff-notice-daily` scheduler (`0 9 * * *`, accountant timezone, job name `handoff_notice`) next to the overdue scan and dispatch on the job name in the overdue-scan worker; verify on worker boot the log shows both schedulers and that boot does not run the notice scan
- [x] 6.2 Add the new functions to `docs/pipeline.md` (the stop row: who is told next morning, by which function) and mention the notice in the collection-window comment block; verify the doc names every new function

## 7. Template with Meta (owner)

- [x] 7.1 Owner: create `finish_conversation` in the Twilio Content Template Builder with the text from design.md (Hebrew, Utility, 3 variables, no buttons) and submit it to Meta; done when Meta shows it approved and the Content SID is known
- [x] 7.2 Add the seed migration with the approved SID, body copied verbatim, `variable_count` 3, agent type `declaration_of_capital`, purpose `handoff`; verify `npm run db:migrate` passes and the admin template list shows it as `handoff`

## 8. Check end to end

- [x] 8.1 Local run: take a test-free client with a WhatsApp number, set its due date to yesterday, run the overdue scan, then run the notice scan by hand on a business day; verify one template arrives with the advisor's name and email, the timeline shows it, and a second run sends nothing
- [ ] 8.2 Local run: stop a client, resume it, run the notice scan; verify nothing is sent. Then set a new past due date, run both scans; verify a second notice is sent
- [x] 8.3 Run `npm run typecheck` and `npm test`; verify both pass
