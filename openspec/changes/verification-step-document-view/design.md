## Context

The document pane already exists end to end: `StepDetailModal` asks `api.adminGetStepFile(step.id)` when `step.targetType === 'document_file'`, and the server answers `/api/admin/audit-events/:id/file[/view|/download]` through `resolveStepFile` (`src/api/stepFile.ts`), which only follows a `document_file` target. The verification steps (`verifyDocument.ts`) target the list item (`client_document`) and put the file id in `detail.fileId` (a plain top-level string). The planner's replan step also targets a list item but names files only inside a `documents` array, so it must stay single-column.

## Goals / Non-Goals

- Goal: the same two-pane modal and the same endpoints for a list-item step that names one file in its details.
- Goal: keep the browser ignorant of file ids; it still asks by step id only.
- Non-goal: steps that name several files; the LLM call modal (covered by the sibling change `show-document-in-llm-call-modal`); any new route or database column.

## Decisions

1. **One rule, two places.** A pure rule decides which file a step is about:
   - target `document_file` with a uuid target id: that id (today's rule);
   - target `client_document` and `detail.fileId` is a uuid string: that id;
   - otherwise none.
   The server side lives in `resolveStepFile` (the audit row it receives already carries `detail` and `client_id`). The browser side is a small helper next to `stepLink.ts`, used by `StepDetailModal` only to decide whether to request the document. Both read the same two fields, so they stay in step without sharing code across the server/web boundary.
2. **Client check on the details path.** A target id is written by the code that owns the row, but `detail` is a free JSON bag, so when the file comes from `detail.fileId` the resolver also requires the file's `client_id` to equal the step's `client_id`; a mismatch is "not found". The target path keeps today's behavior.
3. **No new i18n or CSS.** The pane, its buttons, the loading and "no longer available" notes are reused as they are.

## Risks / Trade-offs

- `detail.fileId` is the only convention; a future step that stores the file under another key gets no pane. Acceptable: the four verification steps all use `fileId`, and the rule is in one place per side.
- Old `document.verification_failed` rows written by the stalled-injection branch have no `fileId` and stay single-column, which is correct.

## Testing

- `tests/stepFile.test.ts`: list-item step with `detail.fileId` returns the file; mismatched client returns null; list-item step without `fileId` (or with a non-uuid value) never reads a file; the `document_file` cases stay unchanged.
- Browser check by the owner: open a `verify_extraction` step from the trace and from its step link; the PDF shows beside the checks; a `planner.rerun_after_verification` step stays single-column.
