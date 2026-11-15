## Why

Since `client-tax-advisor` every declaration client carries the team member who handles it, but the sidebar still lists every client to every team member. A staff viewer who opens the workspace wants to see their own clients first, without reading every row's advisor on the details tab.

## What Changes

- A **"my clients only" checkbox** above the client search box, shown whenever the loaded list holds at least one client whose stored tax advisor email equals the signed-in person's email (case-insensitive). When ticked, the list, the color counts and the search apply to those clients only.
- **Default**: ticked for a staff viewer, unticked for the accountant. The choice is not kept across page reloads (like the color filter).
- The checkbox is never shown when nobody in the list is assigned to the signed-in person (the accountant with no own clients, an admin viewing as the accountant, a viewer without assigned clients), so the list can never open empty because of it.
- Works on both surfaces, the standalone app and the monday custom object, since both pass the signed-in email to the sidebar.
- No server change: the advisor email is already in every client row the list receives.

## Capabilities

### New Capabilities
- (none)

### Modified Capabilities
- `client-search`: adds the "my clients only" narrowing to the sidebar; the color-count requirement now counts the list after that narrowing.

## Impact

- `web/src/format.ts` — `isAssignedTo(client, email)` pure helper (next to `clientMatchesQuery`).
- `web/src/components/Sidebar.tsx` — the checkbox, its default by role, and the narrowed base list feeding the counts and the search; needs a `viewer` flag prop.
- `web/src/components/Workspace.tsx` — passes `viewer={Boolean(viewer)}` to the sidebar (userEmail is already passed).
- `web/src/i18n.tsx` — label, hover text, and the empty-list text for the narrowed list.
- `web/src/styles.css` (or the sidebar stylesheet) — reuse `.sidebar-deleted-toggle` styling for the new checkbox.
- `tests/clientDot.test.ts` or a new `tests/assignedClients.test.ts` — unit test for `isAssignedTo`.
