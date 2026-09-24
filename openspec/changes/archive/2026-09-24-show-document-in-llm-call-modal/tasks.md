## 1. Server: a call's document by call id

- [x] 1.1 Add `resolveCallFile(callId, { getCall, getFile })` in `src/api/stepFile.ts` (UUID check, load the call, require `document_file_id`, load the file; null otherwise) and verify with new cases in `tests/stepFile.test.ts` (call with a file, call without a file, malformed id, unknown call, file gone) via `npm test`
- [x] 1.2 Add `adminGetCallFile` and `adminServeCallFile(disposition)` in `src/api/llmAdmin.ts`, built from the same handler bodies as the step ones (parameterised by resolver), and mount `/admin/llm-calls/:id/file`, `/file/view`, `/file/download` behind `requireAdmin` in `src/api/router.ts`; verify with `npm run typecheck` and a curl as admin (JSON, then inline PDF), as accountant (same refusal as `/admin/llm-calls/:id`), and for a `generate_message` call (404)

## 2. Web: shared document pane

- [x] 2.1 Extract the document pane from `StepDetailModal.tsx` into `web/src/components/DocumentPane.tsx` (props: `doc`, `viewUrl`, `downloadUrl`) plus a `useStepDocument(enabled, key, fetcher)` hook for the none/loading/missing/file state; `StepDetailModal` uses both with the step helpers and verify the step modal is unchanged (typecheck passes, a `validate_classification` step still opens two-pane, an `apply_additions` step single-column, a deleted file shows the note)
- [x] 2.2 Add `adminGetCallFile`, `adminCallFileViewUrl`, `adminCallFileDownloadUrl` to `web/src/api.ts` next to the step helpers and verify with `npm run typecheck`

## 3. Web: the call modal

- [x] 3.1 In `CallDetailModal` (`AdminLlmCalls.tsx`), once the call arrives, start the document fetch when `documentFileId` is set; render `.gate-modal-with-doc` with `.gate-modal-details` + `DocumentPane` when the file is loading or loaded, otherwise the single column as today with the "document no longer available" note on a 404; drop the inline width/height style in the two-pane case; verify by opening an `Extract Document · harel.pdf` chip (PDF beside details, download + open full size), a `Generate Message` chip (single column, no `/file` request in the network tab), and the same call from `#/llm-calls/<id>` (same layout)
- [x] 3.2 Verify the narrow layout: at a window width under 900px the document sits below the call details and the modal scrolls as one

## 4. Spec and wrap-up

- [x] 4.1 Run `openspec validate show-document-in-llm-call-modal --strict`, `npm run typecheck`, `npm test`; commit per the repo git workflow
