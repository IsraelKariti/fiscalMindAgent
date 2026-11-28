## 1. Zip logic on the server

- [x] 1.1 Add `archiver` and `@types/archiver` as direct dependencies in `package.json`; verify `npm install` succeeds and `npm run typecheck` passes
- [x] 1.2 Move the download-name rule out of `streamFile` into a shared `downloadNameOf(file, parent)` and make `streamFile` call it; verify with a unit test for a plain file and for a named split child, and that the single-file download still saves under the same name
- [x] 1.3 Create `src/api/filesZip.ts` with `zipEntriesFor(files)` (drops split originals, "קבצים שלא שויכו/" folder for files with no item, numbered suffix on a name clash, oldest first); verify with unit tests for each scenario of the "Content of the zip" requirement
- [x] 1.4 Add `streamFilesZip(res, clientName, entries)` to `src/api/filesZip.ts` (headers, one blob after the other, skipped blobs listed in "קבצים חסרים.txt", archive error destroys the response); verify with a unit test that feeds fake blob streams, one of them failing, and reads the resulting zip

## 2. API route

- [x] 2.1 Add `GET /clients/:id/files.zip` to `src/api/workspace.ts` with the `readableClient` check, 404 for an unknown or foreign client; verify with `curl` against the dev stack that a known client returns a zip and a foreign client id returns 404
- [x] 2.2 If `docs/agents.md` lists the workspace file routes, add the new route there; verify the list matches `workspace.ts`

## 3. Web

- [x] 3.1 Rename the i18n key `requiredDocuments` to `documentsCardTitle` with the value "מסמכים" and add the texts for the button ("הורדת הכל" and its tooltip); verify `npm run typecheck` passes and no "מסמכים נדרשים" card title remains (the two import-settings texts that mention the monday column stay)
- [x] 3.2 Add `filesZipUrl(clientId)` to `web/src/api.ts` using `tokenizedUrl`; verify typecheck
- [ ] 3.3 Add the "הורדת הכל" button to the header of `DocumentsCard`, shown only when there is at least one file that is not a split original, not hidden by `readOnly`; verify in the browser that it shows for a client with files and is absent for a client with none

## 4. Checks

- [x] 4.1 Run `npm run typecheck` and `npm test`; verify both pass
- [ ] 4.2 In the browser, click "הורדת הכל" on a local client that has linked files, an unmatched file and a split file; open the zip in Windows Explorer and verify the Hebrew names are readable, the unmatched file is in "קבצים שלא שויכו", the children are present and the split original is not
- [ ] 4.3 Open the same client inside the monday custom object (`npm run build:gui` first) and verify the button downloads the zip there too
