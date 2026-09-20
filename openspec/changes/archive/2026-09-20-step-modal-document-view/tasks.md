## 1. Server: shared file streaming

- [x] 1.1 Move `INLINE_VIEW_TYPES` and the streaming body of `serveFile()` from `src/api/workspace.ts` into a shared module exposing `streamFile(res, file, disposition)` (headers, `nosniff`, split-child download name, pipe); the workspace routes keep their client/instance lookup and call it. Verify `npm run typecheck` passes and the documents card viewer and download still work on a PDF and on a split child.
- [x] 1.2 Add a unit test for the helper's disposition rule: PDF/PNG/JPEG/GIF/WebP asked inline → `inline`; `text/html` and `image/svg+xml` asked inline → `attachment`; verify `npm test` passes.

## 2. Server: a step's file, admin only

- [x] 2.1 In `src/api/llmAdmin.ts` add the step-file lookup (audit row by id → `target_type === 'document_file'` → `documentFiles.getById(target_id)`) and three handlers: meta (`{ file: { id, filename, label, parentFileId, contentType } }`), inline view, download; each answers 404 "not found" for a bad id, a non-file step, or a missing file. Verify with a unit test of the lookup for the three 404 cases and the success case.
- [x] 2.2 Register `GET /api/admin/audit-events/:id/file`, `/file/view` and `/file/download` in `src/api/router.ts` behind `requireAdmin`, next to the single-step route. Verify with curl on the local stack: an admin session gets the PDF of step `646d8431-43ac-41af-9904-6a3f80f447cc` with `Content-Disposition: inline`, and a non-admin session gets the same refusal as `/api/admin/audit-events/:id`.

## 3. Web: API and shared pieces

- [x] 3.1 Add `adminGetStepFile(stepId)`, `adminStepFileViewUrl(stepId)` and `adminStepFileDownloadUrl(stepId)` to `web/src/api.ts` with a `StepFile` type; verify typecheck.
- [x] 3.2 In `FileViewModal.tsx` widen `canPreview` to accept `{ content_type: string }` and export the display-name rule (`label · filename` for a split child) so both modals share them; verify the file viewer renders as before.
- [x] 3.3 Add the i18n strings (document loading, preview unavailable reuse, document no longer available, open full size, download reuse) in every locale file; verify typecheck (locale types are exhaustive).

## 4. Web: two-pane step modal

- [x] 4.1 In `StepDetailModal.tsx`, when `step.targetType === 'document_file'` and `step.targetId` is set, load the step file on mount with `loading` / `ready` / `missing` states (cancel on unmount); non-file steps make no request. Verify in the network tab: opening an `apply_retirements` step makes no file request, opening the classification step makes one meta request and one view request.
- [x] 4.2 Render the two-pane layout for `loading` and `ready`: existing content wrapped in a details pane, a document pane with a header (display name, "download", "open full size" as a new-tab link hidden when not previewable) and a body (iframe for PDF, img for images, "preview unavailable" otherwise); `missing` keeps the single column plus the "document no longer available" note. Verify on step `646d8431-…`: the Harel PDF shows beside the failed `issuer_matches_item` check.
- [x] 4.3 Add the styles in `web/src/styles.css`: wide-modal modifier (`min(1280px, 96vw)`, `88vh`, two-column grid, independent pane scrolling), document pane look shared with `.modal-viewer-body`, and the single-column stack under 900px with a fixed-height document pane. Verify at desktop width, at 800px and at phone width, in the Hebrew UI, the only locale (pane order follows the text direction).
- [x] 4.4 Confirm the modal contract is intact on a file step: no close button, copy buttons beside the title, focus moves into the dialog on open, Escape and backdrop close it, buttons reachable by Tab with accessible names.

## 5. Verify across surfaces and finish

- [x] 5.1 Open the same file step from the workspace trace under impersonation, from the admin conversation viewer, and from its step link without impersonation; verify the document shows in all three. Also open a `validate_file_split` step (original PDF shows) and an image file step. (Checked: step link by Claude, workspace trace by the owner with the PDF page visible, `validate_file_split` shows the original. Not checked: the admin conversation viewer — same component — and an image file, none exists in the local data.)
- [x] 5.2 Update `docs/agents.md` where it lists the trace / admin step routes with the three new routes; verify `npm run typecheck` and `npm test` pass.
