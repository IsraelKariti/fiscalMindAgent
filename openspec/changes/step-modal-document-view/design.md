## Context

See proposal.md for the motivation.

- The step detail modal (`web/src/components/StepDetailModal.tsx`) gets one `AdminConversationStep`. The step carries `targetType` / `targetId` but no client id.
- Four audit actions target a received file today (`targetType: 'document_file'`): `validate_classification`, `validate_file_split`, `injection.cycle_suppressed`, `email.document_sent`.
- A file viewer already exists (`FileViewModal.tsx`): `<iframe>` for PDF, `<img>` for images, `canPreview()` mirroring the server's `INLINE_VIEW_TYPES`. It reads the file through the **workspace** API (`/clients/:id/files/:fileId/view`), which is scoped to one agent instance and the accountant's (or impersonated) session.
- The modal opens in three places. Two have a workspace session only sometimes: the admin conversation viewer and the step link run without impersonation, so the workspace file route is not usable there.
- `serveFile()` in `src/api/workspace.ts` holds the streaming, the inline-type allowlist, `nosniff`, and the split-child download name. No framing header is set on API responses, so a same-origin iframe of an API route already works (the file viewer proves it).

## Goals / Non-Goals

**Goals:**
- One way to reach a step's file that works in all three places the modal opens.
- Reuse the existing streaming and the existing safety rules instead of a second copy.
- No new dependency and no migration.

**Non-Goals:**
- Highlighting the place on the page that a check read (needs coordinates the file check does not record).
- Showing a document for steps that target a list item (`client_document`) rather than a file.
- Changing `FileViewModal` or the workspace file routes' behavior.
- A custom PDF renderer (pdf.js): page thumbnails, text search, annotations.

## Decisions

### 1. Admin routes keyed by the step id, not by client + file id
New routes under the existing single-step route, all behind `requireAdmin`:

- `GET /api/admin/audit-events/:id/file` → `{ file: { id, filename, label, parentFileId, contentType } }` or 404
- `GET /api/admin/audit-events/:id/file/view` → inline stream
- `GET /api/admin/audit-events/:id/file/download` → attachment stream

The handler loads the audit row, requires `target_type === 'document_file'`, loads the file with `documentFiles.getById(target_id)`, and 404s otherwise.

Why: the modal only has the step. Keying by step id means the browser never names an arbitrary file id, the audit row is the authorization path ("this admin may see this step, so they may see the file it checked"), and the step link works with no impersonation. Alternative considered: add `clientId` to the step payload and call the workspace route. Rejected: it fails without a workspace session, and the monday transport's tokenized URLs do not apply to an admin page.

### 2. Extract the streaming from `workspace.ts` into a shared helper
Move `INLINE_VIEW_TYPES` and the body of `serveFile()` (headers, split-child download name, pipe) into a small shared module (for example `src/api/fileStream.ts`) exposing `streamFile(res, file, disposition)`. The workspace route keeps its own client/instance lookup and calls the helper; the admin route does its step lookup and calls the same helper. One allowlist, one `nosniff`, one naming rule.

Alternative considered: copy the ~25 lines into `llmAdmin.ts`. Rejected: the inline allowlist is a security rule (HTML/SVG inline would run script on the API origin); two copies will drift.

### 3. Two-step load in the web: meta first, then the frame
On mount, when `step.targetType === 'document_file' && step.targetId`, the modal calls `api.adminGetStepFile(step.id)`. States: `loading` (two-pane with a loading note), `ready` (two-pane with the document), `missing` (single column + "document no longer available"). The iframe/img `src` is the plain same-origin URL `/api/admin/audit-events/<id>/file/view` (cookie session; no tokenized URL needed because admin pages never run inside monday).

Why meta first: the pane needs the content type to pick iframe / img / "preview unavailable", and the display name for its header. It also gives a clean 404 path instead of a broken frame.

### 4. Browser PDF viewer in an `<iframe>`, no PDF library
Same as `FileViewModal`. It gives scroll, zoom, page jump and print for free, costs no bundle size, and matches what the app already does. Trade-off accepted: the viewer's look differs a little per browser, and a mobile browser without an inline PDF viewer shows its own fallback — the "download" and "open full size" buttons cover that case.

### 5. Layout: a wide modal with a CSS grid, stacked under ~900px
File steps add a modifier class (for example `gate-modal-with-doc`): width `min(1280px, 96vw)`, height `88vh`, `display: grid; grid-template-columns: minmax(360px, 2fr) 3fr`. Each pane gets `min-height: 0; overflow: auto`. The document pane reuses the look of `.modal-viewer-body` (dark backing, white iframe, contained image). Under `max-width: 900px` the grid becomes one column, the modal scrolls as a whole, and the document pane gets a fixed height (`70vh`) so the PDF viewer stays usable.

Pane order follows the document direction (details at the inline start, document at the inline end), so it mirrors correctly in the Hebrew UI without extra rules. Non-file steps keep `.gate-modal` exactly as it is (640px).

### 6. Share the small pieces of `FileViewModal`, not the whole component
Export and reuse `canPreview` (widen its argument to `{ content_type: string }`) and the display-name rule (`label · filename` for a split child). `FileViewModal` itself stays a separate full-screen modal bound to the workspace API; nesting one modal in another is not wanted.

"Open full size" is a plain link to the `/file/view` URL with `target="_blank" rel="noopener"`. It is hidden when `canPreview` is false, because the server would send a download anyway.

### 7. Focus and Escape
Unchanged: the dialog takes focus on open. Known browser limit: once the admin clicks inside the PDF frame, key presses go to the PDF viewer, so Escape no longer reaches the modal until focus returns to it. The backdrop click always closes. `FileViewModal` has the same limit today.

## Risks / Trade-offs

- [An admin route streams any client's file] → It is reachable only through an audit row that already names that file, only by an admin, and admins can already see every client's files through impersonation. No new audience.
- [Inline rendering of an unsafe type on the API origin] → The shared helper keeps the single allowlist and `nosniff`; a spec scenario covers HTML/SVG; a test asserts the disposition.
- [Moving `serveFile` could break the workspace viewer] → The move is mechanical; verify the documents card viewer and download still work, and keep the workspace route paths unchanged.
- [Large PDFs load on every modal open] → Only on open, only for file steps, and the browser caches the response for the session. No prefetch.
- [Old steps whose file was deleted with its client] → `missing` state, single-column modal, a plain note.

## Migration Plan

No migration and no env change. Ships with the normal push-to-master sandbox deploy. Rollback is reverting the commit; the new routes are additive.
