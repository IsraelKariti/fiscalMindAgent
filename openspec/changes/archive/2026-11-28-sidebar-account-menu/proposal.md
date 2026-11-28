## Why

The sidebar spends a large part of its height on things the accountant rarely uses: the "FiscalMind" brand box, the agent label ("הצהרת הון"), the settings link, the logout link and the "viewing as" box. The client list, which is the main work area, gets what is left. Moving these items into one menu behind the email row gives the client list the whole sidebar.

## What Changes

- The email row at the bottom of the sidebar (avatar + email) becomes a button for every user. Today it is a button only on multi-agent accounts.
- The row shows the FiscalMind logo next to the email, in place of the round letter avatar.
- The row is highlighted while the mouse pointer is over it and while the menu is open.
- A click on it opens a menu that opens upward (a "drop-up"), above the row.
- The menu holds, from top to bottom:
  - the "FiscalMind" brand box (logo + name),
  - the agent label (icon + agent name, "הצהרת הון"),
  - the "viewing as" box with its exit button (admin view-as only),
  - the settings item ("הגדרות"),
  - the "all agents" item (multi-agent accounts only, already in today's menu),
  - the logout item ("התנתקות", hidden in the monday embed as today).
- These items are removed from their current places: the brand box and the agent label leave the top of the sidebar, the settings link, the logout link and the "viewing as" box leave the footer.
- On a multi-agent account the agent label in the menu lists every enabled agent with a check mark on the active one, and a click switches agent. This replaces the agent-switch dropdown that hung from the agent label at the top.
- The menu closes on a click outside it, on Escape, and after an item is chosen.
- The sidebar then shows only the client list area (add-client button, toggles, search, status filter, clients) and the email row.

## Capabilities

### New Capabilities
- `sidebar-account-menu`: the menu opened from the email row at the bottom of the workspace sidebar — what it holds, who sees which item, and how it opens and closes.

### Modified Capabilities

None. No existing spec states where the brand box, agent label, settings link, logout link or "viewing as" box sit in the sidebar. The `admin-impersonation` spec covers the session, not the place of the box.

## Impact

- `web/src/components/Sidebar.tsx`: the header, the footer and the menu markup.
- `web/src/styles.css`: menu layout, removal of the header spacing, the settings item's selected state.
- `web/src/i18n.tsx`: no new strings expected; the email row keeps the existing `accountMenuTitle` tooltip.
- No server, API, database or `Workspace.tsx` prop change. The monday embed uses the same sidebar and gets the same menu without the logout item.
