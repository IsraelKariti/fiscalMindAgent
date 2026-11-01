## Why

The search box above the client list matches only the client's name, email or phone. Accountants look clients up by the office file number ("מס תיק"), the column of the הצהרות הון monday board that the board mapping already reads at kickoff and stores on the client (`agent_fields.file_number`, since the declaration kickoff; the admin test-client form sets it too). Today that number is stored but neither searchable nor visible in the list.

## What Changes

- The sidebar search also matches the client's file number (exact or partial digits, spaces and dashes ignored).
- Each client row in the sidebar shows the file number next to the contact line when the client has one, so the accountant sees why a row matched.
- The search placeholder says "name, email or file number".
- Clients without a stored file number (enrolled by the daily import scan and never kicked off, or kicked off before the file-number column was mapped) are simply not matched by number; a later kickoff backfills the number, as today.

## Capabilities

### New Capabilities
- `client-search`: what the sidebar client search matches (name, contact, file number), how the query is normalised, and where the file number shows in the list.

### Modified Capabilities
- (none)

## Impact

- `web/src/components/Sidebar.tsx` (filter + row), `web/src/format.ts` (query normalisation helper), `web/src/api.ts` (`file_number` on the client's agent fields type), `web/src/i18n.tsx` (placeholder, file-number label), `web/src/styles.css` (row chip).
- No server change: `agent_fields` already travels to the web with every client row.
