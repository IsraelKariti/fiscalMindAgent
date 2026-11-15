## 1. Helper

- [x] 1.1 Add `isAssignedTo(client, email)` to `web/src/format.ts` (trim + lowercase, false on missing advisor/email) and a unit test `tests/assignedClients.test.ts` covering match, letter case, missing advisor, null email; verify `npm test` passes after registering the file in package.json.

## 2. Sidebar

- [x] 2.1 `Sidebar.tsx`: new `viewer?: boolean` prop; `myOnly` state defaulting to `viewer`; `assignedCount`; `baseClients` feeds `statusCounts` and `visibleClients`; render the checkbox above the search input only when `assignedCount > 0`, with `t.sidebarMyClientsToggle` and `title={t.sidebarMyClientsToggleTitle}`; verify web typecheck passes.
- [x] 2.2 `Workspace.tsx`: pass `viewer={Boolean(viewer)}` to `Sidebar`; `i18n.tsx`: the two strings; verify web typecheck passes.

## 3. Verification

- [ ] 3.1 Browser, as the accountant: with one client assigned to the accountant's own email the checkbox shows unticked; ticking it narrows the list and the color counts; verify by eye.
- [ ] 3.2 Browser, as a staff viewer (or in the monday object): the checkbox opens ticked and the list shows only the viewer's clients; unticking shows all; a viewer with no assigned clients sees no checkbox; verify by eye.
- [x] 3.3 Run `npm run typecheck` and `npm test`; commit per the Git workflow.
