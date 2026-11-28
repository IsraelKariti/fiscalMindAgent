## 1. Menu in the sidebar component

- [x] 1.1 In `web/src/components/Sidebar.tsx`, make the email row always the button variant: remove `hasAccountMenu` and the non-button `.account-row` branch. Verify: the row toggles `menuOpen` on a single-agent account.
- [x] 1.1a In the email row, replace the letter avatar with the FiscalMind logo image (`/petal-seal.svg`, 30px). Verify: the row shows the logo next to the email and no letter circle.
- [x] 1.2 Move the brand box (logo + "FiscalMind") from the top of the sidebar into the menu as its first, non-interactive row. Verify: no `.sidebar-brand` element is left outside the menu.
- [x] 1.3 Move the agent label into the menu under the brand box. Single agent: a non-interactive row with icon and name. Several agents: the existing `menuitemradio` rows with the check mark, each closing the menu and calling `onSwitchAgent`. Delete `switcherOpen`, `switcherWrapRef` and the `.agent-switch-wrap` block. Verify: `npm run typecheck` passes with no unused state.
- [x] 1.4 Move the viewing-as card into the menu after the agent rows, shown only when `impersonatingEmail` is set, with the same exit button. Verify: the card is not rendered in the footer any more.
- [x] 1.5 Move settings and logout into the menu as items (settings, then the existing "all agents" item, then logout). Each closes the menu and then calls its handler; settings carries the selected look when `settingsSelected`; logout renders only when `onLogout` is passed. Verify: the footer holds only the email row.
- [x] 1.6 Simplify the outside-click and Escape effect to the one remaining menu. Verify: Escape and a click on a client row both close the menu.

## 2. Styles

- [x] 2.1 In `web/src/styles.css`, add menu-scoped rules for the brand row, the agent row and the viewing-as card (padding, no bottom border, dividers between the label block and the action items), and a selected state for the settings item. Verify by eye in the browser, in RTL.
- [x] 2.2 Give `.account-menu` a `max-height` with vertical scroll, and fix the top spacing of `.sidebar-scroll` now that the brand box is gone. Verify: on a short window the menu stays inside the screen and the first client-list control does not touch the top edge.
- [x] 2.3 Strengthen the email row highlight: `.account-row-btn:hover` and `[aria-expanded='true']` get the same background as a hovered client row, and the email text goes to full text color. Verify: hovering the row in the browser shows a clear highlight, and it stays while the menu is open.
- [x] 2.4 Remove CSS that no element uses any more (`.agent-switch-wrap`, `.account-menu.agent-switch-menu`, `.agent-identity-btn`, `.agent-switch-chevron`, `.sidebar-brand` if unused elsewhere). Verify: a grep for each removed class in `web/src` returns nothing.

## 3. Checks

- [x] 3.1 Run `npm run typecheck` and `npm test`; both pass.
- [ ] 3.2 In the running app as an accountant: the sidebar shows only the client list area and the email row; the menu opens upward with brand, agent label, settings, logout; settings opens the settings page and shows as selected; logout shows the confirmation modal.
- [ ] 3.3 In the running app as an admin viewing as an accountant: the menu shows the "צפייה בתור" card with the email; the exit button returns to the admin panel.
- [ ] 3.4 Open the `/monday-object` surface (after `npm run build:gui`): the menu opens, fits the frame, and has no logout item.
