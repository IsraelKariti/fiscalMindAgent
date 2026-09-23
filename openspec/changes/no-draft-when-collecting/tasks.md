## 1. Decision contract

- [x] 1.1 Add `collect` to the `decision` enum in `decisionSchema.ts`, add `afterVerification` to `DecisionContext`, and make `decisionSchemaForContext` drop `collect` from the enum when the context is a follow-up cycle; verify with a unit test that the follow-up context's JSON schema lists only `goal_complete` and `follow_up`.
- [x] 1.2 Add a `NormalizedDecision` variant for `collect` (list fields, no message, no `send_at`) and the gate rules: `collect` requires ties; `follow_up` forbids ties; `collect` forbids message fields, `send_at`, `attestation: request` and a fetch action; verify with unit tests for each rejection and for an accepted `collect` answer with a claimed-only document.
- [x] 1.3 Rewrite `correctionSuffix` to state the three-value rule; verify the unit test on the correction text passes.

## 2. Prompt

- [x] 2.1 Update `prompt.md` action 4 to describe `collect`: when to choose it (any file tie, collected mark or `file_ids`), what to leave null, and that the reply comes in a second turn after verification; verify by rendering the prompt in the evals harness and reading the section.
- [x] 2.2 Make `buildVerificationResultsSection` render when the hint is set with no results, stating that no file of this turn was verified and that the answer may not collect; verify with a unit test for the empty-hint rendering and one for the unchanged rendering with results.

## 3. Planner flow

- [x] 3.1 In `plan.ts`, replace the `shouldWithholdDraft` branch with a branch on `decision.decision === 'collect'`: record the deferred-reply step, verify the targets (possibly empty), record the rerun step, and call `planFollowUp` with `afterVerification: true` and the results; pass `afterVerification` into the `DecisionContext`; delete `shouldWithholdDraft` and its test; verify with `npm run typecheck` and `npm test`.
- [x] 3.2 Change the `withhold_reply` label in `web/src/i18n.tsx` to "Reply deferred (awaiting verification)"; verify the label on a trace with an older row.

## 4. Evals

- [x] 4.1 Extend `evals/stages.ts`: `expects.decision` accepts `collect`, the judge checks no message and null `send_at` for `collect` and keeps the list-change checks; add `afterVerification` to the case input for the follow-up cycle; verify with `npm run evals -- --stage generate_message` on the existing cases.
- [x] 4.2 Update cases `dec_13` and `dec_18` to expect `collect` without message checks, and add two cases: a file matching an existing pending row (expects `collect`, `matched_file_ids`) and an empty-batch follow-up (expects `follow_up` with a message and no ties); verify with the run-evals skill that every case is judged and the report shows no regression on the other cases.

## 5. Live check

- [ ] 5.1 Send one text-only WhatsApp message to a local test client and verify the trace shows one planner call with a message and no deferred-reply step.
- [ ] 5.2 Send one file that matches a pending row and verify the trace shows a `collect` answer (validate_message row with decision `collect`), the deferred-reply step, the extraction, the rerun step, and one `send_reply`; verify the first planner call's response holds no message text.
