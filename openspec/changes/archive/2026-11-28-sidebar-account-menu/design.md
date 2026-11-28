## Context

See proposal.md for the motivation. All the affected markup is in one component, `web/src/components/Sidebar.tsx`:

- Top: `.sidebar-brand` (logo + "FiscalMind"), then inside `.sidebar-scroll` the agent label `.agent-identity`. On multi-agent accounts the label is a button that opens `.agent-switch-menu` downward.
- Bottom: `.sidebar-footer` holds the settings button, the logout button, the `.impersonation-card`, and `.account-menu-wrap` with the email row.
- The email row already has a drop-up, `.account-menu`, with outside-click and Escape handling. It is active only when `onShowAgents` is passed (`hasAccountMenu`), and then holds one item.

So the menu mechanics exist. This change makes the menu unconditional and moves the other items into it.

## Goals / Non-Goals

**Goals:**
- One menu, opened from the email row, for every user of the sidebar.
- Reuse the existing `.account-menu` element, state (`menuOpen`, `menuWrapRef`) and close handlers.
- No prop change in `Sidebar`, so `Workspace.tsx` stays as is.

**Non-Goals:**
- No change to the admin panel header or the agents home page, which have their own logout buttons.
- No change to the client list controls.
- No new marker on the email row for an active view-as session (see Risks).

## Decisions

**1. Extend the existing `.account-menu` instead of the shared `Dropdown` component.**
`Dropdown` is a pick-one-value list. This menu mixes plain labels, a card with its own button, and action items. The existing account menu already opens upward and closes correctly. Alternative considered: a new popover component — rejected, it would duplicate what is there.

**2. The email row is always the button variant.**
Remove `hasAccountMenu` and the non-button `.account-row` branch. The settings item is always present, so the menu is never empty. The chevron icon stays as the cue that the row opens something. The row's hover and open highlight already exists (`.account-row-btn:hover`, `[aria-expanded='true']`) at 8% opacity, which is hard to see; it is raised to the same strength as a hovered client row, and the email text goes to full text color on hover.

**2a. The email row shows the logo instead of the letter avatar.**
The `.avatar` span in the row is replaced by the same image the brand box uses (`/petal-seal.svg`, alt `t.logoAlt`), sized like the old avatar (30px). The brand box in the menu keeps its own logo. The `.avatar` CSS stays if other screens use it.

**3. Menu order, top to bottom: brand box, agent label (or agent list), viewing-as card, settings, all agents, logout.**
Identity information first, actions last, logout at the very bottom next to the email row where the pointer already is. Thin dividers separate the label block from the action items.

**4. Brand box and single agent label are non-interactive rows.**
They are rendered as `div`s inside the menu, not `role="menuitem"`, so keyboard and screen-reader users do not land on dead items. They reuse the `.brand` and `.agent-identity` classes with menu-scoped overrides (smaller padding, no bottom border).

**5. Agent switching moves into the menu as a flat list.**
On multi-agent accounts the agent rows are the existing `menuitemradio` buttons from `.agent-switch-menu`, moved into the account menu. The second popover, `switcherOpen` and `switcherWrapRef` are deleted. Alternative considered: keep a nested dropdown inside the menu — rejected, a popover inside a popover is awkward and only one agent type exists today.

**6. The viewing-as card moves as is.**
Same `.impersonation-card` markup and exit button, placed inside the menu. The exit click does not need to close the menu first; the workspace unmounts.

**7. The settings item keeps a selected state.**
The item gets the selected look when `settingsSelected` is true, so the person can still see where they are once the menu is open.

**8. Layout.**
With `.sidebar-brand` gone, `.sidebar-scroll` starts at the top of the sidebar; the top margin of the first control is adjusted so it does not touch the edge. `.sidebar-footer` keeps its top border and holds only the email row. The menu gets a `max-height` with its own scroll so a long agent list cannot leave the screen on a short window.

## Risks / Trade-offs

- [An admin no longer sees at a glance that they are viewing as an accountant; the amber box is hidden until the menu is opened] → The request asks for exactly this. The email row still shows the admin's own email, and the admin-only items (cost pills, deleted-clients toggle) remain visible. A small amber marker on the email row can be added later as its own change.
- [Settings and logout now take two clicks instead of one] → Accepted; both are rare actions.
- [The monday embed gets the same menu] → Intended. It hides logout as today; the menu must fit the narrower iframe, checked in task 3.
