## 1. Shared dot state

- [x] 1.1 Add `clientDotState` to `web/src/format.ts` (refused > done > window_ended > in_progress; undefined flags = false) and verify `npx tsc -p web --noEmit` passes.
- [x] 1.2 Replace the `.status-dot.pending/.complete/.overdue/.wa-muted` classes in `web/src/styles.css` with `.in-progress` (yellow, pulsing), `.done` and `.window-ended` (green), `.refused` (red); verify no component still references the old class names (`grep status-dot web/src`).
- [x] 1.3 Add the four hover texts to `web/src/i18n.tsx` (`dotDone`, `dotWindowEnded`, `dotRefused`, `dotInProgress`) and drop the `goal*Title` keys no longer used; verify the web typecheck passes.

## 2. The two lists

- [x] 2.1 Make `Sidebar.tsx` `dotFor` use `clientDotState` with `isOverdueStopped` / `isDeclined` and the new titles; verify in the browser that a refused client is red, an overdue-stopped one green, a complete one green, a chased one yellow.
- [x] 2.2 Make `Overview.tsx` use `clientDotState` with the summary's `overdue_stopped` / `declined` and the new titles; verify in the browser the same four cases match the sidebar and the hover texts differ between the two greens.

## 3. Wrap up

- [x] 3.1 Commit and push per the Git workflow (typecheck first).
