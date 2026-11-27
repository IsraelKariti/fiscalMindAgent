## 1. Kickoff gate

- [x] 1.1 `src/db/queries/clients.ts`: add `setKickoffBlocked(clientId, reason)` and `clearKickoffBlocked(clientId)` on `agent_fields.kickoff_blocked` ({ reason, at }); verify with a unit test on the JSON merge (or the existing clients query test pattern) and `npm run typecheck`.
- [x] 1.2 `src/webhook/mondayKickoffRoute.ts`: add the named step `hasTaxAdvisor(target)` after `isStartable` — maps the intake's `taxAdvisor` to a reason (undefined → `advisor_column_unmapped`, null → `advisor_cell_empty`, email null → `advisor_email_unavailable`), stamps it, records `client.kickoff_refused` (actor accountant, detail reason + boardId/itemId), publishes the client update and returns false (webhook still 200). A passing gate clears the stamp before `recordKickoff`. Verify with a route-level test stubbing the collaborators: each of the three refusals drafts nothing and records the event; an advisor with email (match `none` included) starts.
- [x] 1.3 Web: `api.ts` (`ClientAgentFields.kickoff_blocked`), `ClientHeader.tsx` badge "no tax advisor on the board row" (Hebrew + English strings in `i18n.tsx`), shown to accountant, staff viewer and admin view-as; hidden once the field is gone. Verify in the browser on a local client with the field set by hand, and `npm run typecheck`.
- [x] 1.4 `docs/pipeline.md` kickoff table + `docs/agents.md` kickoff paragraph: the gate step and its reasons. Verify by reading the rows.

## 2. Acknowledgement text rules

- [x] 2.1 `src/agents/declarationOfCapital/clientDeclineRules.ts`: add the pure `declineContact(client, accountant)` → `{ name, email }` (stored advisor via `readTaxAdvisor`; accountant display name / login email only when no advisor or no advisor email) and verify with unit tests for: advisor with email, advisor without email, no advisor, no accountant.
- [x] 2.2 Same file: change `declineAckText(client, accountant, missing)` to name the contact, give the email, ask the client to send the documents there, and list every missing document (no cap, no list line when empty); update `declineAckDelivery` to pass the list through. Verify with `tests/clientDecline.test.ts`: the existing acknowledgement test updated, plus cases for an 18-item list (all present) and the empty list.

## 3. Decline routine

- [x] 3.1 `handleClientDeclineWith`: load the document list once before the acknowledgement, pass `missingDocumentNames(...)` to the delivery, reuse the same list for the accountant email, and split the body into two consecutive sends (sentences, then list) when it exceeds 1600 characters; a failed list read must not skip the acknowledgement (send it without a list and log). Verify with the routine tests in `tests/clientDecline.test.ts` (stub `listDocuments`, assert the sent body contains the advisor name, email and item names) and `npm test`.
- [x] 3.2 `docs/agents.md` client-decline paragraph: the acknowledgement names the tax advisor, carries the email and the full missing list; accountant fallback for test/pre-gate clients. Verify by reading the paragraph.

## 4. Checks

- [x] 4.1 `npm run typecheck` and `npm test` pass; commit per the Git workflow.
- [ ] 4.2 Live check, decline (owner): a local client with a stored advisor taps the decline button; verify the WhatsApp message names the advisor, shows the email and lists every missing item, and the trace shows `send_decline_ack` with an emailId.
- [ ] 4.3 Live check, gate (owner): on the local stack with monday reconnected (`users:read`), click the kickoff on a row with an empty advisor cell → badge appears, no draft; fill the cell, click again → badge gone, first draft held as usual.
