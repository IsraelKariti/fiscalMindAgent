## Why

When a client declines the WhatsApp collection, the fixed acknowledgement only says "hand the documents to the office of accountant X". The client is left without a concrete way to do that: no name of the person who actually handles their file, no address to send the documents to, and no list of what is still needed. The tax advisor is already read from the monday board at kickoff (`client-tax-advisor`) and the missing-document list already feeds the accountant's decline email, so the acknowledgement can give the client everything they need to finish on their own — provided every started client really has an advisor, which the kickoff does not guarantee today.

## What Changes

- **A client without a tax advisor is not started.** The monday kickoff refuses to draft the first message when the board does not map the advisor column, the advisor cell is empty, or the advisor's email could not be read (no `users:read` on the monday connection). The client is still enrolled and remembers its row; the refusal is recorded on the client and shown in the workspace header ("no tax advisor on the board row"), so the accountant fills the cell and clicks again. **BREAKING** for boards that do not map the advisor column: their rows no longer start until the board is re-added with the mapping.
- The decline acknowledgement sent to the client names the **tax advisor who handles the case**, gives the **advisor's email address**, asks the client to **send the documents to that email**, and **lists every document still missing** (the pending and unresolved items of the client's document list, by their list names, with no cap).
- Clients that have no stored advisor despite the gate — admin test clients, and clients started before this change — get the accountant's name and login email in the acknowledgement instead.
- The accountant's decline email and the stop/pause behaviour do not change.

## Capabilities

### New Capabilities
- (none)

### Modified Capabilities
- `client-tax-advisor`: new requirement — the kickoff does not start a client without an advisor with an email, records the refusal and shows it in the workspace.
- `client-decline`: the requirement "The client hears one fixed acknowledgement" changes — the acknowledgement names the tax advisor, carries the advisor's email and the full missing-document list, and asks the client to email the documents there.

## Impact

- `src/webhook/mondayKickoffRoute.ts` — a new named step after the client is resolved, before `recordKickoff`, refuses the start and stamps the reason; a successful later start clears the stamp.
- `src/agents/declarationOfCapital/kickoff.ts` — the refusal reason comes from the resolved `taxAdvisor` of the intake (undefined = column not mapped, null = empty cell, email null = lookup not possible).
- `src/db/queries/clients.ts` — set/clear of `agent_fields.kickoff_blocked`.
- `web/src/components/ClientHeader.tsx`, `web/src/api.ts`, `web/src/i18n.tsx` — a header badge for the blocked kickoff.
- `src/agents/declarationOfCapital/clientDeclineRules.ts` — `declineAckText` / `declineAckDelivery` gain the contact and the missing-document list; `handleClientDeclineWith` loads the document list before the acknowledgement and reads the stored advisor from the client's `agent_fields`.
- `tests/clientDecline.test.ts`, a new kickoff gate test — see tasks.
- `docs/agents.md`, `docs/pipeline.md` — the kickoff chain gains the gate step; the decline paragraph mentions the advisor and the list.
- No migration (the stamp lives in `clients.agent_fields` JSON), no schema change, no prompt change (the planner still answers `client_declined` and nothing else).
- Depends on the monday connection having `users:read` (change `client-tax-advisor-link`, task 2.1, not yet confirmed live): without it every advisor email is null and every kickoff is refused.
