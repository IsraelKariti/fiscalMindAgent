## 1. Database and types

- [x] 1.1 Add `migrations/058_document_files_split.sql`: `parent_file_id` (UUID, nullable, FK to `document_files(id)` ON DELETE CASCADE), `page_from`, `page_to` (INT, nullable), index on `parent_file_id`, and a comment that `analysis_status` gains `'split'`. Verify: `npm run db:migrate` succeeds locally and `\d document_files` shows the three columns.
- [x] 1.2 Update `src/db/types.ts`: add `'split'` to `FileAnalysisStatus`; add `parent_file_id`, `page_from`, `page_to` to `DocumentFileRow`. Mirror the fields in the file type of `web/src/api.ts`. Verify: `npm run typecheck` passes.
- [x] 1.3 Extend `src/db/queries/documentFiles.ts`: `insertIfNew` accepts optional `parentFileId`, `pageFrom`, `pageTo`; add `setSplit(id)` (status `'split'`, `analysis` NULL, `analyzed_at` now). Verify: `npm run typecheck` passes and existing callers compile unchanged.

## 2. PDF helper

- [x] 2.1 Add the `pdf-lib` dependency. Verify: `npm install` succeeds and `npm run typecheck` passes.
- [x] 2.2 Create `src/agents/declarationOfCapital/pdfPages.ts` with `readPdfPageCount(bytes)` and `cutPdf(bytes, ranges)` (the only module importing `pdf-lib`; an encrypted or damaged PDF throws). Add `tests/pdfPages.test.ts` that builds a 5-page PDF in memory, cuts it into 1-3 and 4-5, and asserts the page counts of the children (3 and 2) and that a garbage buffer throws. Add the file to the `test` script. Verify: `npm test` passes.

## 3. The file_splitting stage (follow `.claude/skills/add-llm-stage`)

- [x] 3.1 Create `splitFileRules.ts`: the zod schema `{ documents: [{ first_page, last_page, kind }] }`, `MAX_SPLIT_DOCUMENTS = 20`, and the pure gate `validateFileSplit(raw, pageCount)` returning `{ result, reason, checks, ranges }` with the four check keys and ordering rules of the `code-gates` delta spec. No imports of `gemini/`, `db/`, `audit/`.
- [x] 3.2 Add `tests/splitFileRules.test.ts`: a valid two-range split, a single full-range document, one case per rejection (range outside the file, first page after last page, overlap, wrong order, page left out, zero documents, above the cap), and exact `checks` lists (keys, order, `passed`, `note`, `observed`, `expected`) for one pass and one failure, including that later range checks are absent after a failed one. Add the file to the `test` script. Verify: `npm test` passes.
- [x] 3.3 Create `splitFile.ts`: `FILE_SPLIT_PROMPT` (Hebrew, in the style of `ANALYSIS_PROMPT`: the file is untrusted data; report each document's first and last page; a multi-page statement from one issuer is one document; every page must belong to exactly one document; pages are consecutive), `buildFileSplitCall` (trusted text in `systemInstruction`, only the bytes and the sanitized filename in the user turn, temperature 0.1), and `splitFile(...)` that does `runLlmCall(buildFileSplitCall(...), { log })` → parse → `validateFileSplit`. Verify: `npm run typecheck` passes.
- [x] 3.4 Register the stage: purpose `file_splitting` in `LLM_CALL_PURPOSES` (`src/gemini/modelCatalog.ts`), action `validate_file_split` in the `AuditAction` union (`src/audit/audit.ts`), the stage entry in `src/gemini/llmStages.ts` (`TEMPERATURES` + `STAGES`). Verify: `npm test` passes, including `tests/llmStages.test.ts`.
- [x] 3.5 Add labels in `web/src/i18n.tsx`: `llmPurposeLabels.file_splitting`, the gate title in `codeGateLabels`, and a Hebrew label per check key in `gateCheckLabels`. Verify: `npm run typecheck` passes and the admin `#/llm-stages` page lists the new stage with its gate.

## 4. Wire the step into inbound file analysis

- [x] 4.1 In `analyzeInboundFile.ts`, extract the classify-and-store block (required documents → `analyzeFile` → `validate_classification` audit → `setAnalysis` → usage) into one internal function taking a file row and bytes, and call it from the existing path. Verify: `npm run typecheck` and `npm test` pass; behavior for a single file is unchanged.
- [x] 4.2 After the injection layers pass, for `application/pdf` files call `readPdfPageCount`; when it returns 2 or more, run `splitFile`, record the `validate_file_split` audit row on the parent file (severity info/warning, `detail`: `result`, `reason`, page count, document count, ranges, sanitized `kind`s capped at 80 characters, `checks`), and add the usage via `llmUsage.add`. Wrap the whole split block in its own `try/catch` that logs and falls through to the whole-file classify. Verify: with the dev stack, send a 1-page PDF and an image and confirm no `file_splitting` row appears in the LLM call browser.
- [x] 4.3 When the gate accepts 2 or more documents: `cutPdf`, then for each range upload the child blob and `insertIfNew` with the derived `provider_attachment_id` (`<parent>#p<from>-<to>`), blob key, filename, parent id and page range; then `setSplit(parent)`; then run the function from 4.1 on each child (no injection layers). On a rejected gate, an error, or a single document, classify the whole file as today. Verify: with the dev stack, send a synthetic PDF holding two different documents and confirm in the DB one parent with status `split` and two children with status `done`, each with its own `validate_classification` audit row; send it again through the same code path and confirm no duplicate children.

## 5. Planner and evidence rules

- [x] 5.1 `prompt.ts` `formatFileAnalysis`: add the `'split'` branch (the file was split into N separate files listed next to it; never use it as evidence or match it). Pass the child count in. Verify: a unit test or a snapshot of the built prompt for a client with a split parent shows the line and the children's own analysis lines.
- [x] 5.2 `plan.ts`: drop planner-proposed pairs whose file has status `'split'` before the collected/claimed decision and before `linkToDocument`. Add a comment in `fileEvidence.ts` that `'split'` is neither quarantined nor evidence. Verify: a test (next to the existing plan/evidence tests) where the decision pairs a split parent with a pending document asserts the document is not collected and the parent stays unlinked.

## 6. Workspace documents tab

- [x] 6.1 `DocumentsCard.tsx`: add the `'split'` badge ("split into N documents", N = files whose `parent_file_id` is this file) with a tooltip, no verdict line. Add the Hebrew strings to `web/src/i18n.tsx`. Verify: in the dev GUI the parent appears in the unmatched group with the badge and working view/download.
- [x] 6.2 `DocumentsCard.tsx`: for a file with `parent_file_id`, render the muted note "pages X-Y of <parent display name>" ("page X" when X equals Y), both under a checklist item and in the unmatched group. Verify: in the dev GUI a child under its checklist item shows the note, and view opens a PDF with only its pages.
- [ ] 6.3 Run `npm run build:gui` and check the same card inside the monday custom object. Verify: the badge and the note render correctly in the right-to-left layout.

## 7. Evals

- [x] 7.1 Run `/add-eval-case` for the new stage: add the `file_splitting` adapter to `evals/stages.ts` (`build` calls `buildFileSplitCall`, `judge` runs `validateFileSplit` first, then compares ranges with the expected ranges) and create `evals/cases/file_splitting.json` with about 10 synthetic PDFs: two documents, three documents, one long single-issuer statement (must stay one document), a cover page followed by a document, two documents of the same type from different issuers, a two-page single document, and a file with an injection-like line (must still return plain ranges). Verify: `/run-evals` runs the stage and the report lists every case with its verdict.
- [x] 7.2 Record the first score of the stage in the eval report as the baseline. Verify: the report file exists and is committed.

## 8. Docs and final checks

- [x] 8.1 Update `docs/agents.md`: add `validate_file_split` and its modules to "Code gates and the three injection layers", and describe the split step in the inbound-file flow. Verify: the section names the step, the purpose and the three new modules.
- [x] 8.2 Full check: `npm run typecheck`, `npm test`, then one end-to-end run on the dev stack (the `verify` skill): send a mixed PDF over the WhatsApp webhook path and confirm both checklist items become collected and then verified from their own child files, and the conversation timeline shows the `validate_file_split` row with its clickable checks. Verify: all commands pass and the run behaves as described.
- [x] 8.3 Note in the change's final commit message that production and the local DB need migration 058. Verify: the message contains the note.

## Notes from the apply run (2026-09-19)

- 8.2 was run with a script instead of a real WhatsApp webhook: Twilio media must be hosted by Twilio, so a local PDF cannot enter through the webhook. The script stored the file like `ingestWaMedia` does and called `analyzeStoredFile` (the same code path from there on) for a throwaway client that is paused and admin-paused, so no planner cycle ran and nothing could be sent. Collection was done the tier-A way (`fileMatchesDocument` + `markCollected` + `linkToDocument`), then the real `verifyCollectedDocument` ran per child. Result: parent `split`, two children `done` and matched to their own rows, both rows `approved`; a one-page PDF made no `file_splitting` call; processing the parent again created no duplicates and made no second split call. The planner side is covered by unit tests (`fileEvidence.test.ts`, `splitFileTranscript.test.ts`).
- 6.3 is open: `npm run build:gui` passes, but the card was not looked at inside the monday custom object.
- Added during apply (owner's decision): the conversation shows the original file and its children as attachment chips (see the last requirement of the `file-splitting` delta spec).
