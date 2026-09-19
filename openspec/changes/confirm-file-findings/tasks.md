## 1. Baseline

- [x] 1.1 Run the evals for `file_classification` and `generate_message` with the run-evals skill and keep the report as the "before" score; verify the report file exists.

## 2. File check reads the accounts and policies

- [x] 2.1 Add `holdings` (product, holder_name nullable, account_number nullable; max 20) and `holdings_partial` to `FileAnalysisSchema` in `analyzeFileRules.ts`, and as optional fields on the stored analysis type in `src/db/types.ts`; verify `npm run typecheck` passes and a unit test parses an old analysis without the fields.
- [x] 2.2 Add the `holdings` instruction to `ANALYSIS_PROMPT` in `analyzeFile.ts` (only institution-bound types, copy as printed, null for a missing or hidden name, never from the file name or the list, empty array otherwise), with the type names taken from the catalog; verify a unit test of `buildAnalysisCall` finds the instruction and the type names in the system text.
- [x] 2.3 In the gate result, drop the list when the file's `document_type` is not institution-bound, without touching `result` or `checks`; verify a unit test: a vehicle licence with a stray list ends with an empty list and the same checks as before.
- [x] 2.4 Add eval cases to `evals/cases/file_classification.json` with the add-eval-case skill (synthetic PDFs): two policies with two holders; two accounts with the holder blacked out (expects `holder_name: null`, and not a name from the list); a vehicle licence (expects an empty list); verify the cases pass in a run of the stage.

## 3. Planner sees the list

- [x] 3.1 In `formatFileAnalysis` (`prompt.ts`) print the count and each entry after the issuer, cleaned with `sanitizeInline`, the number cut to its last 4 characters, "hidden in the file" for a null holder, "(partial list)" when flagged; nothing for a quarantined file, an old analysis, or an empty list; verify unit tests for each of these cases, including a holder name that carries instruction-like text.

## 4. Planner rule: state and confirm

- [x] 4.1 Rewrite the paragraph "a file that does not belong to the list" in `prompt.md` per design decision 4 and 5 (state what was read, ask to confirm, no question for a fact the line shows, open question only for a missing fact and say it is missing, one grouped statement for many files, create all confirmed items in the cycle after a short confirmation, item names carry company and holder); verify the prompt tests still pass and the paragraph names both bad questions as forbidden examples.
- [x] 4.2 Add eval cases to `evals/cases/generate_message.json` with the add-eval-case skill: (a) three insurer files, each listing two policies with two holders, judged by code that the reply names the three companies and the count and holds none of the forbidden question phrases; (b) a file with a hidden holder, judged that the reply says the name is hidden and asks whose it is; (c) eleven unmatched files, judged that the reply ends with one question mark group and creates no item; (d) the client's "כן, הכול נכון" after the confirmation, judged that items are created with that quote as evidence and with `file_ids` set; verify the cases pass.

## 5. Docs and final check

- [x] 5.1 Update `docs/agents.md` and the `file_classification` stage description (shown on the LLM stages page) to mention the list of accounts and policies; verify the text appears on the `#/llm-stages` page in the running app.
- [x] 5.2 Run `npm run typecheck` and `npm test`; verify both pass.
- [x] 5.3 Run the evals again for both stages and compare with the baseline of 1.1; verify no case that passed before now fails.
- [ ] 5.4 End-to-end check with the verify skill on the local stack (the user runs the stack): send a PDF with several fund and insurance reports to a test client; verify in the conversation trace that the file lines show the account lists and that the held reply states what was found and ends with a confirmation request, not an open question.
