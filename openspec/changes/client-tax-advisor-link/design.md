## Context

See proposal.md — Why. Current state that shapes the approach:

- Declaration boards are mapped in `BoardMappingModal` → `SourceMappingForm`, stored as column ids in `agent_instances.settings` (`BoardSourceSchema`, strict: an unknown key drops every board, so the new key must be in the schema before any UI writes it).
- The kickoff (`src/webhook/mondayKickoffRoute.ts` → `resolveDeclarationClient` in `declarationOfCapital/kickoff.ts`) reads the row with `fetchItemDetails`, which returns per column `text` and, for connect-boards columns, `linkedItemIds`. A people column's `text` is the display names joined by ", "; the person ids come only from the `PeopleValue` fragment (`persons_and_teams { id kind }`).
- monday's `users(ids:)` query (name + email) needs the `users:read` scope. The stored tokens were granted `boards:read boards:write docs:read` (`src/api/mondayOauth.ts`), so existing connections return a GraphQL error for that query until the accountant reconnects.
- The staff list is `accountant_staff` (email unique, lower-cased, per accountant); the accountant's own email is `users.email`. A staff viewer cannot read the staff list (`GET /staff` is refused), so the web cannot do the matching itself.
- The details tab renders `ClientHeader` with meta chips driven by `client.*` and `client.agent_fields.*`; the web `Client` type exposes `agent_fields` as `ClientAgentFields`.

## Goals / Non-Goals

**Goals:**
- One more optional declaration-board column, read at the same point as file number and year.
- Matching done on the server at kickoff, stored on the client, so every workspace surface reads one value.
- Zero schema migrations.

**Non-Goals:**
- Filtering or grouping the client list by advisor.
- Writing the advisor back to monday, or editing it in the workspace.
- Notifying the advisor, or giving a staff member a "my clients" view.
- Re-syncing the advisor outside a kickoff (no daily scan; the scan does not enroll catalog-seeded types).
- Matching by display name when the email is unknown.

## Decisions

1. **Store the advisor in `clients.agent_fields.tax_advisor`**, shape `{ name: string; email: string | null; monday_user_id: string; match: 'accountant' | 'staff' | 'none'; staff_id?: string }`, written through `clients.setDeclarationEngagement` next to `file_number`.
   - Alternative: a `clients.tax_advisor_staff_id` column referencing `accountant_staff`. Rejected: the advisor may be the accountant (no staff row), staff rows are deleted on removal (a cascade or SET NULL would silently lose the name), and it needs a migration for a per-agent field. `agent_fields` is where the other kickoff-read identity lives.
   - `staff_id` is a convenience; the chip reads `match` and `name`. A staff row removed later leaves a stale id, which nothing dereferences.

2. **Match by email, at kickoff, on the server.** `resolveTaxAdvisor(instance, board, row, accessToken)` is one named step in the kickoff chain (docs/pipeline.md convention): read the cell's first person id → `fetchUsers` → compare lower-cased email with `users.getById(instance.user_id).email`, then `accountantStaff.findForAccountantByEmail(instance.user_id, email)`. Returns the stored shape or `null` (cell empty).
   - Alternative: match in the web from the staff list. Rejected: viewers cannot read the list, and admin view-as would need a second route.
   - Only the first person is used; teams (`kind: 'team'`) are ignored. Logged when the cell has more than one entry.

3. **Add `users:read` to `MONDAY_OAUTH_SCOPES`; degrade gracefully for old tokens.** `fetchUsers` throws `MondayApiError` on the scope error; `resolveTaxAdvisor` catches every error, stores `{ name: <cell text>, email: null, monday_user_id, match: 'none' }` and logs `declaration kickoff: advisor email unavailable (reconnect monday for users:read)`. The kickoff never fails on this.
   - Alternative: resolve the email through the board's CRM-style columns. Rejected: a people cell holds account users, not board items.
   - Alternative: match by name against `users.name`. Rejected: Google names vs monday names differ (Hebrew/English); false links are worse than none.

4. **`fetchItemDetails` gains `personIds: string[]`** (from `... on PeopleValue { persons_and_teams { id kind } }`, persons only), empty for other types — same pattern as `linkedItemIds`. `fetchUsers(accessToken, ids)` is a new exported helper in `mondayData.ts` returning `{ id, name, email }[]`.

5. **Mapping UI:** `BoardMappingModal` computes `peopleOptions` (type `people`), preselects by `/יועץ/`, and passes `taxAdvisorOptions` to `SourceMappingForm`, which renders the dropdown inside the existing `declaration` block after the year field; `ColumnMapping.taxAdvisorColumn` → `BoardMapping.taxAdvisorColumnId`. `ClientSourcesSettings` adds the summary chip after the year chip. Server `BoardSourceSchema` gets `taxAdvisorColumnId` (optional, documented as declaration-only).

6. **Details chip:** `ClientHeader` renders a `MetaChip` with a person icon, label `t.taxAdvisorLabel`, value = name, or `t.taxAdvisorUnlisted(name)` when `match === 'none'`; the `title` carries the email when present. Rendered in the read view only (not in the edit grid). No `readOnly` branch needed: the chip is never editable.

7. **Audit:** the existing `client.auto_enrolled` / `client.kickoff_triggered` detail gains `taxAdvisor: { name, match }` when read; no new action.

## Risks / Trade-offs

- [Existing connections lack `users:read`] → advisor stored by name as unmatched + one warning per kickoff; the Settings connection card already offers reconnect. Documented in docs/agents.md and the proposal; no forced disconnect.
- [Board was added before the change] → mapping has no advisor column; the accountant removes and re-adds the board (same limitation as the documents status column).
- [Person's monday email differs from the staff email] → unmatched, visible as "not on the staff list" so the accountant can fix the list.
- [Multi-person cell] → first person only, logged.
- [`agent_fields` JSON key stays after the board drops the mapping] → by design: a board without the mapping leaves what is stored (requirement), only an empty cell clears it.

## Migration Plan

1. Deploy: no DB migration. `MONDAY_OAUTH_SCOPES` change needs no Developer Center change if the app's scope list there already includes `users:read`; otherwise add it in the monday Developer Center before deploying (one manual step, noted in tasks).
2. Accountant: reconnect monday from Settings, re-add the declarations board to map the advisor column.
3. Rollback: revert the code; stored `tax_advisor` keys and `taxAdvisorColumnId` keys are tolerated by the strict schema only while the key exists — keep the schema key on rollback (same note as `statusColumnId`).
