## Why

Since the step-modal document view (2026-09-20), a code step about a received file (a gate, a split, a tie) opens with the checked document beside its details. The LLM calls that read the same file (file splitting, file classification, document extraction) record the file they read (since 2026-09-23), and their chip and modal name it, but the call detail modal still shows only the prompt and the response. The admin who wants to judge what the model saw must leave the modal, find the file in the timeline and open it in the viewer, which is the same detour the step modal already removed.

## What Changes

- The LLM call detail modal (opened from a trace chip, from the admin call browser, or from a `#/llm-calls/<id>` link) shows the document the call read beside the call details, in the same two-pane layout the step modal uses: details in one pane, the document in the other, each scrolling on its own; on a narrow screen the document moves below the details.
- Above the document the pane shows the file's display name, a "download" button and an "open full size" button, exactly as in the step modal. A file type that cannot be previewed keeps "download" and drops "open full size".
- A call that recorded no file (message drafting, questionnaire, planner, every call recorded before file ids were kept) keeps the single-column modal it has today. A call whose file no longer exists keeps the single column and shows the "document no longer available" note.
- The document is requested only when the call modal opens; the call list, the trace and the conversation load no document.
- The server serves a call's document addressed by the call id alone (name and type, inline view, download), admin-only, streamed under the admin session, with the same type rules as the step document endpoints. An accountant's session never receives it.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `conversation-trace`: two requirements are added next to "Per-file LLM call rows name their file" and "A step's document is served to admins only": the call detail modal shows the file the call read beside its details, and the server serves a call's document addressed by the call id, admin-only.

## Impact

- Server: `src/api/llmAdmin.ts` (three new handlers for `/admin/llm-calls/:id/file`, `/file/view`, `/file/download`), `src/api/router.ts` (routes), `src/api/stepFile.ts` (a call-keyed resolver next to the step-keyed one, or a shared one), `tests/stepFile.test.ts`.
- Web: `web/src/components/admin/AdminLlmCalls.tsx` (`CallDetailModal` gains the document pane), `web/src/components/StepDetailModal.tsx` (the document pane is extracted so both modals share it), `web/src/api.ts` (three helpers), `web/src/styles.css` (the two-pane rules are reused, not duplicated), `web/src/i18n.tsx` (reuses the existing document-pane strings).
- No database change: `llm_calls.document_file_id` (migration 059) already holds the file id.
- Specs: `openspec/specs/conversation-trace/spec.md`.
