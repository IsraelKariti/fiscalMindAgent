## Context

See proposal.md - Why. Today the kickoff route (`startClientForItem` in mondayKickoffRoute.ts) runs one named function per step: board, resolve client, remember row, startable check, audit, form intake, draft. `resolveDeclarationClient` (kickoff.ts) reads the row, resolves the advisor (`resolveTaxAdvisor`: undefined = column not mapped, null = empty cell, `email: null` = users lookup not possible) and enrolls the client with the advisor in `agent_fields.tax_advisor`. Refusals in that chain (no CRM link, no phone, no year) are log-only: the webhook answers 200 and nothing is shown to the accountant.

On the decline side, `handleClientDeclineWith` (clientDeclineRules.ts) sends the acknowledgement first and loads the document list only afterwards for the accountant's email. The text is a pure function (`declineAckText(client, accountant)`), wrapped by the delivery guard `declineAckDelivery`.

## Goals / Non-Goals

**Goals:**
- Every client the agent talks to has an advisor with an email, so the decline acknowledgement never has to guess who to name.
- The accountant sees why a click did nothing, on the client, without reading logs.
- Keep the acknowledgement a code-authored fixed text: no planner call, no review step.

**Non-Goals:**
- Changing the other kickoff refusals (year, CRM link, phone): they stay log-only.
- Writing the refusal to the monday board status column (its label set is fixed by `monday-documents-status`; a new label would have to exist on every board).
- Emailing the advisor on a decline (the email still goes to the accountant).
- Requiring an advisor for admin test clients.

## Decisions

- **Gate after resolution, before the audit and the draft.** A new named step `hasTaxAdvisor(target)` in the route chain, placed after `rememberBoardRow` and `isStartable`: the client is already enrolled and knows its row (so the re-click finds it), and nothing is drafted. Alternative: refuse inside `resolveDeclarationClient` before enrolment, like the year. Rejected: then no client exists to carry the reason, and the accountant sees nothing.
- **Reason stored on the client**, `agent_fields.kickoff_blocked = { reason: 'advisor_column_unmapped' | 'advisor_cell_empty' | 'advisor_email_unavailable', at }`, written by `clients.setKickoffBlocked` and cleared by `clients.clearKickoffBlocked` at the top of a successful start (before `recordKickoff`). The header badge reads this field; the trace reads the `client.kickoff_refused` audit row. Alternative: audit row only. Rejected: the header is where the accountant looks; the trace is admin-oriented.
- **Any match value passes** (`accountant`, `staff` or `none`): the gate is about having a person with an address, not about the staff list.
- **Resolve the acknowledgement's contact in one pure function** `declineContact(client, accountant)` → `{ name, email }`: stored advisor name and email; accountant display name and login email only when no advisor is stored (test clients, pre-gate clients). An advisor stored without an email cannot exist after the gate for kickoff clients; for safety the function falls back to the accountant's email in that case too.
- **Load the document list once, before the acknowledgement**, and reuse the same `missingDocumentNames` result for the email.
- **Every missing document is listed, no cap.** A Twilio free-form WhatsApp body is capped at 1600 characters; a declaration list rarely passes 25 items, which stays under it. If the built body would exceed the limit, it is sent as two consecutive messages (the fixed sentences, then the list) rather than cut.
- **Empty list → no list line.** The message then only says who to contact.
- **Email shown as plain text** inside the message (WhatsApp makes it tappable).

## Risks / Trade-offs

- [Boards added before the advisor mapping existed stop starting clients] → the badge names the cause; the accountant re-adds the board with the advisor column (the modal only runs on add, as with the documents status column). Called out as BREAKING in the proposal.
- [`users:read` not yet on the monday connection (open task in `client-tax-advisor-link`)] → every advisor has `email: null` and every kickoff is refused with "email could not be read". The accountant must reconnect monday once. The live check (task 4.3) covers it before anything ships to production.
- [Stored advisor is stale: the board changed after kickoff] → the admin "re-read tax advisors" action refreshes it; the text reads whatever is stored at decline time.
- [Long document names] → they are the same names the accountant's email already uses; a body over 1600 characters is split into two messages (see Decisions).
- [Latin monday display name for the advisor in a Hebrew message] → accepted; the name is shown as stored.

## Migration Plan

No migration, no deploy step beyond the regular push. Before enabling in production: confirm the monday app lists `users:read` and the accountant reconnected; otherwise no kickoff starts. Rollback = revert the commit; a blocked marker left on a client is harmless (the badge code is gone, the field is ignored).
