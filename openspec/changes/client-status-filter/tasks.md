## 1. Helpers

- [x] 1.1 Add `DotColor`, `dotColorOf(state)` and `countByDotColor(clients)` to `web/src/format.ts`; verify `npx tsc -p web --noEmit` passes.

## 2. The control

- [x] 2.1 Add the four-button bar to `Sidebar.tsx` between the search box and the list (state `statusFilter`, default `all`, `role="radiogroup"`), with the i18n labels and titles; verify in the browser that the bar shows "הכל <total>" and the three colored counts.
- [x] 2.2 Filter `visibleClients` by the pressed color together with the search text; verify in the browser that pressing a color narrows the list, "הכל" restores it, and typing a name narrows further.
- [x] 2.3 Style `.status-filter` in `styles.css` (one rounded bar, pressed button filled, dots without pulse); verify in the browser that the pressed button is clearly distinct and the bar fits the sidebar width.

## 3. Wrap up

- [x] 3.1 Commit and push per the Git workflow (typecheck first).
