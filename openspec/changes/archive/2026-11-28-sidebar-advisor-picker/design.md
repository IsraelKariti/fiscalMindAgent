## Context

See proposal.md for the reason. Today `Sidebar.tsx` holds a boolean `myOnly` and a pill button that flips it; `isAssignedTo(client, meEmail)` in `web/src/format.ts` decides whether a client is the signed-in person's. Every client in the roster already carries `agent_fields.tax_advisor` (`name`, `email`, `match`), so the sidebar knows every advisor without a new request. The app has a styled `Dropdown` component (list portaled to `<body>`, keyboard support, closes on blur and Escape).

The open change `sidebar-filter-toggles` introduced the two-toggle row. Its code is on master, but its spec delta is not yet in `openspec/specs/`.

## Goals / Non-Goals

**Goals:**
- One picker replaces the toggle, with the options and order of the spec.
- No server, database or API change.

**Non-Goals:**
- Picking several advisors at once.
- A "no advisor" option for clients without a stored advisor.
- Keeping the choice across reloads or in the URL.
- Changing the questions toggle, the search box or the color buttons.

## Decisions

**1. The advisor list comes from the loaded clients, not from the staff list.**
The options are the distinct `tax_advisor` values of the clients in the sidebar. The staff list (`/staff`) was the alternative. It was rejected: an advisor can be stored as "not on the staff list" and still have clients, a staff member with no clients would be an option that always shows an empty list, and a staff viewer would need a new read permission for the staff list.

**2. One advisor = one key.**
The key is the lower-cased, trimmed email. An advisor without an email uses `name:<trimmed name>`. The picker's state is `'all' | 'me' | <key>`. The label of a key is the name of the first client that carries it; if the name is empty, the email.

**3. Two pure functions in `web/src/format.ts`, with unit tests.**
- `advisorOptionsOf(clients, meEmail)` returns the other advisors (`{ key, name }[]`), without the signed-in person, sorted with `localeCompare(…, 'he')`.
- `isAdvisedBy(client, choice, meEmail)` answers for `'all'`, `'me'` (delegates to `isAssignedTo`) and a key.
The sidebar only wires them. This keeps the grouping and sorting testable without a browser.

**4. Reuse `Dropdown` for the list.**
`Dropdown` gets optional props: a class for the trigger, custom trigger content (icon + text), and a minimum list width. The picker button then keeps the pill look of `sidebar-filter-toggle` and the list is wider than the half-row button, so full names fit. A new popover component was the alternative; it would copy the placement, blur and keyboard code that `Dropdown` already has. Existing `Dropdown` callers pass none of the new props and stay unchanged.

**5. The fallback to "הכל" is derived, not stored.**
The sidebar computes the effective choice on each render: a stored key that is not among the current options counts as `'all'`. This is the same pattern as today's `myOnlyActive = myOnly && assignedCount > 0`, and it needs no effect to reset state. "אני" is never dropped this way, because the spec keeps it listed with zero clients.

**6. Opening choice.**
`useState(viewer ? 'me' : 'all')`, as today. For a viewer with no own clients the effective choice is `'all'` (the spec's opening rule), computed as in decision 5 only for the opening value: once the viewer picks "אני" by hand, it stays. A `picked` flag (set on the first manual pick) tells the two cases apart.

**7. Spec order.**
`sidebar-filter-toggles` must be archived (synced) before this change is archived. This change renames the requirement that the older change modifies under its old name.

## Risks / Trade-offs

- [Two advisors with the same name and no email are one option] → Accepted; the kickoff stores an email whenever monday gives one.
- [Many advisors make a long list] → The `Dropdown` list already scrolls.
- [The same person stored once with an email and once without shows twice] → Accepted; the admin "re-read tax advisors" action fixes the stored data.
- [A viewer used to the one-press toggle now needs two presses] → Accepted; the opening choice for a viewer is still "אני".

## Migration Plan

Web-only change. Deploy with the normal flow; `npm run build:gui` rebuilds the monday custom object. Rollback is a revert of the commit.
