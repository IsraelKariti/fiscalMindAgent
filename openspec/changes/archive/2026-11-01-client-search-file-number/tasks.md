## 1. Matching

- [x] 1.1 Add `file_number?: string` to `ClientAgentFields` in `web/src/api.ts` and `normalizeFileNumber` + `clientMatchesQuery` to `web/src/format.ts`; verify `npx tsc -p web --noEmit` passes.
- [x] 1.2 Make `Sidebar.tsx` `visibleClients` use `clientMatchesQuery`; verify in the browser that typing a client's file number (with and without its dash) lists that client and typing a name still works.

## 2. Row and placeholder

- [x] 2.1 Show the file number chip (`תיק <number>`) on the contact line of a client row when present, with the i18n label and a `styles.css` rule; verify in the browser that a client with a number shows the chip and one without shows the row as before.
- [x] 2.2 Change `sidebarSearchPlaceholder` to name name, email and file number; verify the placeholder text in the browser.

## 3. Wrap up

- [x] 3.1 Commit and push per the Git workflow (typecheck first).
