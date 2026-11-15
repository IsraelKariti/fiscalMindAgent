## Why

The accountant's declarations board has a people column "יועץ מס" naming the team member who handles each client, but the workspace knows nothing about it: a client's details tab shows no advisor, and nothing ties the monday person to the staff list the accountant keeps in Settings → Staff. Reading that column at kickoff and matching the person to a staff entry (or the accountant) puts the responsible team member on the client's screen where everyone already looks.

## What Changes

- A new optional board mapping for declaration boards, the **tax advisor column**: a people-typed column of the declarations board, picked in the board mapping modal next to the CRM/questionnaire/file-number/year columns and shown in the board's mapping summary. Preselected by title (`יועץ`).
- At every kickoff of a declaration row (first enrollment and every re-fired webhook), the agent reads the mapped people cell, takes the first person, looks up their monday name and email, and stores the **tax advisor** on the client: name, email, and which team member they are — the accountant themselves or one entry of the accountant's staff list, matched by email (case-insensitive). A person on no list is stored with their name and marked as unmatched; an empty cell clears the advisor.
- The client's **details tab** shows the advisor: a chip with the advisor's name next to the existing meta chips; a tooltip gives the email; an unmatched advisor is marked "not on the staff list". Accountant, staff viewer and admin view-as all see it. Nothing is editable there.
- The monday OAuth scope set gains `users:read` so the people cell can be resolved to an email. **Accountants connected before this change must reconnect monday once**; until they do, the advisor is stored by name only (unmatched) and a warning is logged.
- Best-effort like the other kickoff reads: a missing mapping, an empty cell, or a failed user lookup never blocks the kickoff.

## Capabilities

### New Capabilities
- `client-tax-advisor`: the tax advisor board column mapping, the rule that resolves the monday person to a team member at kickoff, and the advisor shown on the client's details tab.

### Modified Capabilities
- (none — `accountant-staff-access` is read for the matching rule, its requirements do not change; `declaration-kickoff` covers identity fields read from the CRM card, the advisor is a column of the declarations row itself, so it gets its own capability.)

## Impact

- `src/agents/shared/clientSources.ts` — `BoardSourceSchema` gains `taxAdvisorColumnId`.
- `src/agents/shared/mondayData.ts` — `ItemColumnDetail` gains the people ids of a people column; new `fetchUsers(accessToken, ids)` (name + email).
- `src/api/mondayOauth.ts` — `MONDAY_OAUTH_SCOPES` gains `users:read`.
- `src/agents/declarationOfCapital/kickoff.ts` — new named step `resolveTaxAdvisor` in the kickoff chain; stored through `clients.setDeclarationEngagement` (`agent_fields.tax_advisor`), audited in the kickoff detail.
- `src/db/queries/accountantStaff.ts` — lookup of one staff email within one accountant's list.
- Web: `BoardMappingModal.tsx`, `SourceMappingForm.tsx`, `ClientSourcesSettings.tsx`, `api.ts` (`ClientAgentFields.tax_advisor`, board mapping type), `ClientHeader.tsx` (advisor chip), `i18n.tsx`.
- `tests/` — unit test for the advisor matching rule; a mapping-form test if one exists for the declaration fields.
- `docs/agents.md` — the kickoff resolution paragraph gains the advisor column; monday OAuth scope note.
- No migration: the mapping lives in `agent_instances.settings` JSON, the advisor in `clients.agent_fields` JSON. Boards already added need to be re-added once to pick the new column (the modal only runs on add), as with the documents status column.
