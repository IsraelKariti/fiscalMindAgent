## Context

See proposal.md — Why. Facts that shape the approach:

- `Sidebar.tsx` already narrows the loaded list client-side: `statusFilter` (color buttons, counts from `countByDotColor` over the loaded list) and `clientQuery` (`clientMatchesQuery`). Both are component state, reset on reload.
- The sidebar receives `userEmail` (the signed-in email on both surfaces: Google session in `App.tsx`, monday identity in `MondayObject.tsx`) but not whether the session is a staff viewer; `Workspace.tsx` has `viewer` and already hides add/delete on it.
- Every client row carries `agent_fields.tax_advisor` (`client-tax-advisor`), so the advisor email is available without a server call.
- Under admin view-as, `userEmail` is the admin's email; the sidebar also receives `impersonatingEmail` (the accountant), which is the "me" the checkbox uses so the admin sees the accountant's view.

## Goals / Non-Goals

**Goals:**
- One checkbox, pure client-side, consistent with the existing filters (state in the sidebar, not persisted).
- The base list feeding counts and search is the narrowed one when ticked, so the numbers on the color buttons describe what the person sees.

**Non-Goals:**
- A server-side filter or a per-staff "my clients" route.
- Remembering the choice (localStorage) — same as the color filter.
- Grouping or sorting by advisor.

## Decisions

1. **Pure helper `isAssignedTo(client, email)` in `format.ts`**: true when `client.agent_fields?.tax_advisor?.email` and `email` are both non-empty and equal after trim + lowercase. Unit-tested like `clientMatchesQuery`.
2. **Narrowing order in the sidebar**: `baseClients = myOnly ? clients.filter(isAssignedTo) : clients`; `statusCounts = countByDotColor(baseClients)`; `visibleClients = baseClients.filter(status && query)`. The "הכל" count therefore equals `baseClients.length`; the heading's `side-count` keeps `clients.length` (the loaded list), as the deleted toggle does.
3. **Visibility rule**: `assignedCount = clients.filter(isAssignedTo(userEmail)).length`; render the checkbox only when `assignedCount > 0`. The effective filter is `myOnly && assignedCount > 0`, so a list reload that drops the last assigned client silently falls back to the full list instead of an empty one.
4. **Default by role**: new `viewer?: boolean` prop on `Sidebar`; `useState(() => viewer)` initial value. `Workspace.tsx` passes `viewer={Boolean(viewer)}`.
5. **Placement and style**: directly above the search input, reusing the `.sidebar-deleted-toggle` class (same look as the admin "deleted clients" checkbox) under a new shared class name `sidebar-toggle` if the deleted toggle's selector is renamed; otherwise just reuse the existing class.
6. **Empty text**: when the narrowed base list is empty after status/search, the existing `sidebarNoMatches` message is shown — no new empty state is needed because the checkbox never renders with zero assigned clients.

## Risks / Trade-offs

- [Advisor email missing (old token, unmatched person)] → `isAssignedTo` is false, the client is simply not "mine"; the details chip already shows "not on the staff list" so the cause is visible.
- [monday identity email differs from the Google email] → on the monday surface "mine" follows the monday email; both are compared to the advisor's monday email, so the monday surface is the more reliable one.
- [A viewer with 0 assigned clients sees no checkbox] → intended; nothing to narrow.
