## 1. ActionMenu component

- [x] 1.1 Create `web/src/components/ActionMenu.tsx` modeled on `Dropdown.tsx` (portal to body, fixed placement from the trigger rect, upward flip, reposition on capture-phase scroll + resize, close on blur/Escape with focus back to the trigger, arrow-key focus, `role="menu"`/`menuitem`, props `items`/`label`/`disabled`, per-item `danger` and `title`). Verify: `npm run typecheck` passes.
- [ ] 1.2 Clamp the menu's horizontal position to the viewport (design decision 2). Verify: in the running app, at a narrow window width in RTL, the open menu is fully visible and not cut at either edge.
- [x] 1.3 Add styles to `web/src/styles.css`: icon-only three-dot trigger (reusing `icon-btn`), content-width menu reusing the `dropdown-option` look, divider + danger color for the destructive item. Verify: the menu matches the app theme next to an open `Dropdown` elsewhere in the app.

## 2. Strings

- [x] 2.1 In `web/src/i18n.tsx`: change `markRequired` and `markNotRequired` to verb form, add `unresolvedStatus`, `awaitingClientStatus`, `notRequiredStatus`, `rowActions` (wording in design decision 6); leave `pendingStatus` untouched. Verify: `npm run typecheck` passes and no other component used the two changed keys (`grep markRequired\|markNotRequired web/src`).

## 3. DocumentsCard rows

- [x] 3.1 In `capitalRow`, replace the badge ternary with a status → badge mapping that covers all seven statuses and keeps the stalled `collected` override. Verify: on the test client's documents tab every row in every group, including the collapsed groups, shows a badge.
- [x] 3.2 Replace the inline `controls` buttons and the `chip-x` remove button with one `ActionMenu` per row; items per status exactly as in the spec's "Actions offered per status", former primary action first, remove last with `danger`, trigger disabled while `busy`. Remove `smallBtn` if nothing else uses it. Leave `classicRow` unchanged. Verify: `npm run typecheck` passes and a row at rest shows only name, description, badge and the menu button.

## 4. End-to-end verification

- [ ] 4.1 Drive the running dev stack on a test client: from the menu, move a pending row to not required and back, mark an unresolved row as required, and remove a manually added row. Verify: each row lands in the expected group and the progress badge (`n / m`) changes as it did before this change.
- [ ] 4.2 Check menu behavior: Escape closes and returns focus, click outside closes, Enter/arrow keys operate it, opening a second row's menu closes the first, a row at the bottom of the viewport opens its menu upward. Verify: all scenarios of the spec requirement "The actions menu is an in-app, keyboard-operable popover" hold.
- [ ] 4.3 Run `npm run build:gui` and open the client in the monday custom object. Verify: the menu opens fully inside the iframe and actions work.
