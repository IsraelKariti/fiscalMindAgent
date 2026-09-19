## 1. File check: only agreed items, same institution

- [ ] 1.1 In `classifyAndStore` (`analyzeInboundFile.ts`) pass to `analyzeFile` only rows whose status is not `unresolved` / `not_required` / `retired`; keep the audit row's `candidates` equal to what was shown. Verify with a unit test of the (pure, extracted) filter and `npm run typecheck`
- [ ] 1.2 Add the institution rule to `ANALYSIS_PROMPT` (`analyzeFile.ts`) next to `matched_document_id`; verify `tests/llmStages.test.ts` still passes (prompt text is described there)
- [ ] 1.3 Add `harel_study_fund_2025.pdf` to `evals/make-files.ts`, run `npm run evals:files`, and add a `file_classification` case (list holds only the Altshuler row → `matched_document_id: null`, `document_type: study_fund`) per the add-eval-case skill; verify the case passes on `gemini-2.5-flash` via a `--out evals/results/smoke.json` run, and restore `latest.json` / `report.html` if the run touched them

## 1b. Company comparison in code

- [ ] 1b.0 Build the institutions table from the official registers, not from memory: read the Capital Market Authority's registers (Gemel-Net, Pensia-Net, Bituach-Net — managing companies and self-managed sector funds) and the Bank of Israel's list of licensed banks; write the result to a scratchpad file as `key | registered Hebrew name | short name | English name | fund brand names | source`, and give the owner the count per source. If a register cannot be read from this machine, stop and ask the owner for an export instead of filling the gap from memory. Verify every entry has a source and that no company appears under two keys
- [ ] 1b.1 Add the pure module `institutions.ts` from the file of task 1b.0 (header comment with the source pages and `INSTITUTIONS_AS_OF`), with `identifyInstitution` and the comparison, and `tests/institutions.test.ts` (in the `npm test` list): every alias resolves to its key, Hebrew and English forms of one company agree, two companies in one text → null, longer alias wins, unknown text → null. Verify `npm test` passes
- [ ] 1b.2 `catalog.ts`: `institutionBound` on the six types of design.md decision 2a; verify `tests/capitalCatalog.test.ts` passes with an added assertion listing them
- [ ] 1b.3 Classifier: `issuer_name` in `FileAnalysisSchema`, the JSON schema and `ANALYSIS_PROMPT`; `validateClassification` runs the strict comparison for institution-bound rows, reports `issuer_matches_item`, stores the dropped-match reason; `formatFileAnalysis` (`prompt.ts`) shows the issuer and a dropped match. Verify with new cases in `tests/analyzeFileRules.test.ts` for each scenario of the spec requirement, and add the check's label to `web/src/i18n.tsx`
- [ ] 1b.4 Planner ties: `tieAllowed` pure function + tests; optional `evidence` on `matched_files[]` in all three schemas, validated in `decisionSchema.ts`; the pair filter in `plan.ts` and the `file_ids` helper (task 3.1) use it; refused pairs are listed in the `apply_collections` step detail; `prompt.md` explains the issuer line, the dropped match, and when a pair needs a quote. Verify with unit tests for the outcomes: not bound / same / different / unidentified with and without evidence
- [ ] 1b.5 Extend the `file_classification` eval judge with `issuer_key` (the key code identifies from the answer's `issuer_name`) and set it on the existing synthetic bank / fund cases and the new Harel case; verify on `gemini-2.5-flash` via a smoke run

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
- [ ] 5.1b Read the `validate_classification` audit row of the Harel file: `issuer_matches_item` is absent when the classifier matched nothing, or failed with the note that the companies differ when it matched the Altshuler item; in both cases the stored analysis has no matched item
- [ ] 5.2 Send the text confirmation: the Harel item is created with the quote, the waiting file is attached, verified and approved in that same turn, and the turn has one draft. Then send a pension-type file to a client whose pension question is open: no match, no resolution, the draft asks. Pause the client and delete the scratch script after

## 6. Docs and wrap-up

- [ ] 6.1 `docs/agents.md`: new section "Files that belong to no agreed item" (candidate filter, evidence for every created item, `file_ids`, the lifted same-cycle limit); update the memory note's "known limit" line
- [ ] 6.2 `npm run typecheck`, `npm test`, `npm run build:gui` pass; commit per the repo Git workflow
