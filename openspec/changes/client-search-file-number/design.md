## Context

- The sidebar filter (`Sidebar.tsx`, `visibleClients`) lowercases the query and checks `name`, `email_address` and `contactLabel(client)` (the phone for WhatsApp clients). The row shows the name and the contact line (`client-item-email`).
- The file number is read at kickoff from the board mapping's optional `fileNumberColumnId` (`kickoff.ts`, `agent_fields.file_number`; refreshed on every re-fired kickoff through `setDeclarationEngagement`) and by the admin test-client form. The daily import scan does not read it.
- `toWorkspaceClient` sends the whole client row, `agent_fields` included, so the web already has the number; the web `ClientAgentFields` type just does not declare it.
- Local data: 1 of 2 clients carries a file number.

## Goals / Non-Goals

**Goals:**
- Find a client by file number from the same box, with forgiving digit matching.
- Show the number in the row so a match is explainable.

**Non-Goals:**
- Storing the file number for import-scan clients (a kickoff backfills it; unchanged).
- Searching the overview list or the admin pages.
- Editing the file number in the workspace.

## Decisions

1. **One pure matcher in `web/src/format.ts`.** `clientMatchesQuery(client, query)`: name / email / contact as today (lowercase substring), plus `normalizeFileNumber(query)` non-empty and contained in `normalizeFileNumber(client.agent_fields.file_number)`, where `normalizeFileNumber` strips spaces and dashes and lowercases. Alternative: a plain substring on the raw number; rejected, offices write "2024-4471" and "20244471" interchangeably.

2. **Row chip, not a third line.** The contact line gets a small muted chip `תיק <number>` after the phone/email (same `client-item-email` line, `dir="ltr"` for the digits). Alternative: a separate line; rejected, the list is dense and most clients will have a number.

3. **Type only.** `file_number?: string` added to `ClientAgentFields` in `web/src/api.ts`; no server change.

## Risks / Trade-offs

- [A short digit query also matches phone numbers] → expected: the contact match already works that way; the chip shows which field matched.
- [Clients kicked off before the column was mapped have no number] → unchanged behaviour; a re-fired kickoff fills it.

## Migration Plan

Web-only; ships with the next deploy. Rollback: revert the commit.
