## Context

See proposal.md for the motivation.

Today one file is downloaded through `GET /clients/:id/files/:fileId/download` in `src/api/workspace.ts`. The route checks access with `readableClient`, then `streamFile` (`src/api/fileStream.ts`) pipes the blob to the response. The download name is `file.filename`, or `childDownloadName(...)` for a named child of a split PDF. The web side calls `window.location.assign(await api.fileDownloadUrl(...))`; `tokenizedUrl` adds the URL token the monday custom object needs.

The card header is in `web/src/components/DocumentsCard.tsx` (`.panel-header`: title, then the progress badge). The title text is the i18n key `requiredDocuments`. `DocumentsCard` is used only by `web/src/agents/declarationOfCapital.tsx`.

## Goals / Non-Goals

**Goals:**
- One request, one streamed zip. No temporary file, no whole zip in memory.
- The same names and the same access rule as the single-file download.

**Non-Goals:**
- No choice of which files go into the zip.
- No zip built in the background and no progress bar.
- No audit event for the download (single-file download writes none).

## Decisions

**1. Build the zip on the server and stream it.**
New route `GET /clients/:id/files.zip` in `src/api/workspace.ts`, next to the single-file routes. A new module `src/api/filesZip.ts` holds the logic, so the route only decides access (same split as `fileStream.ts`).
Alternative: build the zip in the browser with `jszip` from N single-file requests. Rejected: it holds every file in browser memory and needs N token-carrying requests in the monday iframe.

**2. Use `archiver` as a direct dependency.**
It streams, it is already in `node_modules` through `exceljs`, and it marks non-ASCII names as UTF-8, which Windows Explorer and macOS read correctly. Compression level stays low (PDFs and images do not shrink much).
Alternative: `jszip` on the server. Rejected: it builds the archive in memory.

**3. Two small pure functions, one streaming function.**
- `zipEntriesFor(files)`: picks the files and gives each a path. It drops files with `analysis_status === 'split'`, puts files without `client_document_id` under "קבצים שלא שויכו/", and adds " (2)", " (3)" before the extension on a name clash inside one folder. Order: oldest first, as the tab shows them.
- `downloadNameOf(file, parentFilename)` in `src/api/downloadName.ts`: the name rule that is inline in `streamFile` today. It moves to one shared function and `streamFile` calls it, so the two downloads cannot drift apart.
- `streamFilesZip(res, zipName, entries, openBlob)`: sets the headers, reads each file whole and adds it to the archive, one file at a time, and finalizes. Memory holds one file. The blob reader is a parameter, so the module needs no storage in tests.
The pure functions get unit tests; no blob storage is needed for them.

**4. A blob that fails is skipped, not fatal.**
The response headers are sent before the first blob is read, so an HTTP error is no longer possible at that point. Each file is read whole inside a try/catch before it is added, so a read that fails halfway also leaves the file out cleanly. A failed one is logged and its name is collected; at the end the names go into "קבצים חסרים.txt". An archive-level error destroys the response, so the browser reports a failed download instead of saving a broken zip.

**5. The button.**
An icon-and-text button "הורד הכל" in `.panel-header`, between the title and the progress badge, using the existing button classes. It is shown when `files` has at least one file that is not a split original (the same rule as `zipEntriesFor`, computed on the client from the list it already holds). It is not hidden by `readOnly`. Click: `window.location.assign(await api.filesZipUrl(clientId))`.

**6. The title.**
The i18n key `requiredDocuments` is renamed to `documentsCardTitle` with the value "מסמכים". The unused `titleKey` prop keeps working with the new default.

## Risks / Trade-offs

- [A client with very large files makes a long request] → the zip streams, memory stays flat; no size limit is added now because one client's files are small (tens of megabytes).
- [No `Content-Length`, so the browser shows no percent] → accepted; the download is short.
- [Hebrew names shown wrong in an old unzip tool] → `archiver` sets the UTF-8 flag; task 4.2 checks it in Windows Explorer.
- [The client name has characters that are illegal in a file name] → the zip name is cleaned with the same replacement `childDownloadName` uses and sent with `filename*=UTF-8''`.
