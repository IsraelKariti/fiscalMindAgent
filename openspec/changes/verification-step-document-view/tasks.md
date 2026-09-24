## 1. Server

- [x] 1.1 Extend `resolveStepFile` in `src/api/stepFile.ts`: a `client_document` step whose `detail.fileId` is a uuid resolves to that file, only when the file's `client_id` equals the step's `client_id`; the generic step and file types gain the fields this needs. Update the header comment.
- [x] 1.2 Add cases to `tests/stepFile.test.ts` (details path, client mismatch, missing or non-uuid `fileId`, replan-style step) and run `npm test`.

## 2. Web

- [x] 2.1 Add a small helper next to `web/src/components/stepLink.ts` that says whether a step is about one received file, using the same two rules; use it in `StepDetailModal.tsx` in place of the `targetType === 'document_file'` check.
- [ ] 2.2 `npm run typecheck`; owner opens a `verify_extraction` step in the trace and from its step link and sees the document beside the checks; a `planner.rerun_after_verification` step stays single-column.

## 3. Docs

- [ ] 3.1 Update the step-modal note in `docs/agents.md` if it lists which steps show a document; commit per the Git workflow.
