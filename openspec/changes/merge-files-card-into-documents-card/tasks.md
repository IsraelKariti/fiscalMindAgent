## 1. Move the analysis line into the documents card

- [x] 1.1 Move the `AnalysisLine` component from `web/src/components/FilesCard.tsx` into `web/src/components/DocumentsCard.tsx` unchanged (verdict text, pending/failed/unsupported badges, blocked badge, suspicious and not-legible badges); verify `npm run typecheck` passes.

## 2. Per-file sub-rows in the capital flow

- [x] 2.1 In `capitalRow`, drop the inline-icons shortcut: render the `doc-file-list` whenever the item has at least one linked file, one `doc-file-item` per file, oldest first; verify an item with one unlabeled file now shows a sub-row instead of icons on the main line.
- [x] 2.2 Give each sub-row a text column: display name (label or filename), a `size · date` meta line, and the analysis line; keep the view/download `FileActions` on the end side; verify a done, a pending, and a blocked file each render per the spec scenarios (use existing client data or the mock tax-fetch in the dev stack).
- [x] 2.3 Update `.doc-file-item` / `.doc-file-label` in `web/src/styles.css` for the multi-line text column (align items to start, keep ellipsis on the name, no strikethrough); verify long filenames still truncate and the row stays inside the card at phone width.

## 3. Unmatched files group

- [x] 3.1 Add the i18n string for the group title (Hebrew, with a count, next to the other `group*` keys in `web/src/i18n.tsx`); verify typecheck passes.
- [x] 3.2 After the capital groups, render a `doc-group` titled with that string listing every file with `client_document_id === null`, each with the same sub-row content and `FileActions` as task 2.2; verify the group appears only when such a file exists and disappears once the file is linked and the tab reloads.
- [x] 3.3 Verify the header progress badge still counts checklist items only while an unmatched file is present.

## 4. Remove the old card

- [x] 4.1 Remove the `FilesCard` mount from the documents tab in `web/src/agents/declarationOfCapital.tsx` and delete `web/src/components/FilesCard.tsx`; verify no remaining imports (`grep -rn FilesCard web/src` is empty except the i18n comment, which should be updated) and `npm run typecheck` passes.
- [x] 4.2 Add a short comment on `classicRow` noting it keeps the old inline-file layout and is unreachable in the current single-agent setup.

## 5. Wrap-up

- [x] 5.1 Manual end-to-end check in the running dev stack: open the client from the screenshot, confirm one card, per-file verdict lines under each item, the duplicate upload shown as two sub-rows under one item, and no unmatched group (or the group, if an unmatched file exists).
- [x] 5.2 Commit per the repo git workflow (pull --rebase, typecheck, commit, push).
