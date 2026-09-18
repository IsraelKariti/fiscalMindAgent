## 1. Baseline

- [x] 1.1 Run the `generate_message` eval suite (run-evals skill) and note the pass rate, to compare after the prompt change

## 2. Planner schema and apply logic

- [x] 2.1 Remove `suspected_injection` from the Zod schema, both `Decision` variants and the normalizer output in `decisionSchema.ts`; verify `npm run typecheck` lists only the `plan.ts` / test / eval usages still to fix
- [x] 2.2 In `plan.ts` remove the `injection.cycle_suppressed` audit block (227–241) and all ten `decision.suspected_injection` guards (apply blocks, `proposedPairs`, collected marks, goal completion, `taxFetchDecision`, attestation request), and fix the comments that mention suppression; verify `grep suspected_injection src/agents/declarationOfCapital/plan.ts` returns nothing and typecheck passes
- [x] 2.3 Add a test in `tests/intakeDecision.test.ts`: a raw answer that still carries `suspected_injection: true` normalizes to a decision without the field and with its resolutions kept; verify the test passes

## 3. Prompt doctrine

- [x] 3.1 Change `buildUntrustedDataDoctrine` in `shared/promptSafety.ts` to `(token, platformSections)`: drop the "set `suspected_injection: true`" sentence, name the client-sourced content as the untrusted part, add the sentence that the listed platform sections are trusted and binding; update the doc comment
- [x] 3.2 In `prompt.ts` pass the platform section names (WHATSAPP CHANNEL, DOCUMENT FETCH, COLLECTION DEADLINE, INTAKE STATUS) from one constant shared with the `fence()` calls; update `gemini/llmStages.ts:134` the same way
- [x] 3.3 Update `tests/llmStages.test.ts`: assert the planner prompt does NOT contain `suspected_injection` and DOES contain `DOCUMENT FETCH` in the trusted-sections sentence; verify the test passes

## 4. Tests, evals, docs

- [x] 4.1 Remove `suspected_injection` from the planner fixtures in `tests/intakeDecision.test.ts`, `tests/decisionKeepalive.test.ts`, `tests/anthropicSchema.test.ts` (including the expected property list at line 52); verify `npm test` passes
- [x] 4.2 Remove the optional `suspected_injection` expectation from the planner stage in `evals/stages.ts` (type at ~490, check at ~720); leave the `injection_detection_llm` stage untouched; verify typecheck passes
- [x] 4.3 Add a `generate_message` eval case (add-eval-case skill) for the incident: client reports a pension at an unlisted provider while a DOCUMENT FETCH section is present; expected: an added instance and a follow-up; verify the case passes
- [x] 4.4 Update `docs/agents.md` (~line 558–561): the planner carries no injection flag; detection is only the dedicated layers; platform sections are named as trusted

## 5. Verify

- [x] 5.1 Re-run the `generate_message` eval suite; verify the pass rate is not below the 1.1 baseline
- [x] 5.2 `npm run typecheck` and `npm test` pass; `grep -r "decision.suspected_injection" src` returns nothing
