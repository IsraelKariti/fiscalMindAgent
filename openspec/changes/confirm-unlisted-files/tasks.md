## 1. File check: only agreed items, same institution

- [ ] 1.1 In `classifyAndStore` (`analyzeInboundFile.ts`) pass to `analyzeFile` only rows whose status is not `unresolved` / `not_required` / `retired`; keep the audit row's `candidates` equal to what was shown. Verify with a unit test of the (pure, extracted) filter and `npm run typecheck`
- [ ] 1.2 Add the institution rule to `ANALYSIS_PROMPT` (`analyzeFile.ts`) next to `matched_document_id`; verify `tests/llmStages.test.ts` still passes (prompt text is described there)
- [ ] 1.3 Add `harel_study_fund_2025.pdf` to `evals/make-files.ts`, run `npm run evals:files`, and add a `file_classification` case (list holds only the Altshuler row → `matched_document_id: null`, `document_type: study_fund`) per the add-eval-case skill; verify the case passes on `gemini-2.5-flash` via a `--out evals/results/smoke.json` run, and restore `latest.json` / `report.html` if the run touched them

## 2. Decision gate: items only on the client's quoted words

- [ ] 2.1 `decisionSchema.ts`: add `evidence` to `added_instances[]` and `file_ids` to every instance (both resolved and added) in the zod schema, the Gemini JSON schema and the Anthropic variant; verify `tests/anthropicSchema.test.ts` passes
- [ ] 2.2 `validateResolutions`: run `validateEvidence` for `required`; `validateAddedInstances`: run it per entry; carry `evidence` and per-instance `fileIds` on `DocumentResolution` / `InstanceAddition`. Verify with new cases in `tests/intakeDecision.test.ts`: no evidence → rejected; message id of a file-only message → rejected; quote from another text → rejected; valid quote → accepted
- [ ] 2.3 `clientDocuments.resolveRequired` / `addInstances` store the evidence in `resolution_evidence` of every created row and return rows in instance order; audit rows `document.resolved` / `document.instances_added` and `resolutionsStepDetail` / `additionsStepDetail` include the quote; update `tests/applyStepDetails.test.ts` and `web/src/components/stepSummary.ts` (+ `tests/stepSummary.test.ts`) and verify they pass

## 3. Attach the waiting file in the same cycle

- [ ] 3.1 Add a pure helper (with `tests/` file added to the `npm test` list) that decides which named files a new row may take: client's file, not a split parent, verified legible, unattached, analysed type equals the row's `type_key`, not taken twice, row not `claimed`. Verify the unit tests cover each refusal and the two-items-one-file case
- [ ] 3.2 `plan.ts`: after the list-changing steps and the row reload, feed the accepted (file, new row) pairs into the cycle's pairs and collected ids so the existing path marks the row collected, links the file, verifies it, withholds the draft and runs one follow-up cycle; the step detail of `apply_resolutions` / `apply_additions` lists attached files. Verify with `npm run typecheck` and task 5.2

## 4. Planner instructions and evals

- [ ] 4.1 `prompt.md`: evidence rule for every `required` resolution and `added_instances` entry (questionnaire, file names and content analysis are never evidence); the unmatched-relevant-file rule (do not change the list, mention the file, ask, wait; on confirmation create with evidence + `file_ids`; do not ask again after a "no"); the question counts within the per-message limit. Edit with the Edit tool (Hebrew), verify the placeholders test / `tests/llmStages.test.ts` pass
- [ ] 4.2 `evals/stages.ts` + `evals/cases/generate_message.json`: judge asserts for "no list change" and "added instance carries file id and evidence"; three new cases per design.md decision 6; update `evals/README.md`. Verify each new case on `gemini-2.5-flash` with `--out evals/results/smoke.json`
- [ ] 4.3 Re-run the existing `generate_message` cases that expect a `required` resolution once on `gemini-2.5-flash` (answer format changed); verify they pass, and report any that fail instead of editing their `expected`

## 5. Live check (user's dev stack, test client in review mode)

- [ ] 5.1 Send the Harel certificate with no text to the paused test client `d4abab00…` after removing its Harel item and unlinking the file (test data): the file ends "matches no document", no item is created, the held draft asks about the Harel fund. Write Hebrew output to a scratchpad file
- [ ] 5.2 Send the text confirmation: the Harel item is created with the quote, the waiting file is attached, verified and approved in that same turn, and the turn has one draft. Then send a pension-type file to a client whose pension question is open: no match, no resolution, the draft asks. Pause the client and delete the scratch script after

## 6. Docs and wrap-up

- [ ] 6.1 `docs/agents.md`: new section "Files that belong to no agreed item" (candidate filter, evidence for every created item, `file_ids`, the lifted same-cycle limit); update the memory note's "known limit" line
- [ ] 6.2 `npm run typecheck`, `npm test`, `npm run build:gui` pass; commit per the repo Git workflow
