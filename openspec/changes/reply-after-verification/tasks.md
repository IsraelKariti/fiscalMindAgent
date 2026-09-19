## 1. Verification returns an outcome, re-plans nothing

- [x] 1.1 List every caller and test of `verifyCollectedDocument` and `planner.rerun_after_verification` (`plan.ts`, `taxFetch/deliver.ts`, `tests/`, `evals/`) and confirm none depends on the per-verdict re-plan; verify by noting the result in this task's commit message
- [x] 1.2 `verifyDocument.ts`: make `verifyCollectedDocument` return `'approved' | 'reopened' | 'stalled' | 'skipped'` and remove `replanAfterVerification` from it; verify `npm run typecheck` passes
- [x] 1.3 Add `verifyBatch(client, instance, targets)` in `verifyDocument.ts`: runs targets one after the other, re-stamps `markDraftingStarted` before each, catches and logs an error per target (outcome `error`), returns `{ documentId, name, outcome }[]`; verify with a unit test (injected verify function) that one throwing target does not stop the batch
- [x] 1.4 Add the pure rule `shouldWithholdDraft({ afterVerification, targets })` next to the other planner rules and unit-test it: collecting cycle with targets → true; no targets → false; follow-up cycle → false; verify `npm test` passes

## 2. Planner path

- [x] 2.1 `plan.ts`: replace the fire-and-forget verification block — when the draft is withheld, record the `withhold_reply` step, await `verifyBatch`, record one `planner.rerun_after_verification` step listing every document and outcome, reload the client, and `return planFollowUp` with `hints: { afterVerification: true }`; verify `npm run typecheck` passes
- [x] 2.2 Make sure the withheld cycle returns before `scheduleDraftMessage`, `send_reply`, `setAttestationRequest`, `applyTaxFetchAction` and the `goal_complete` contract check, and that everything above it still applies; verify by reading the diff against design decision 4 and with a unit test of the rule from 1.4
- [x] 2.3 Register the `withhold_reply` step: `AuditAction` in `src/audit/audit.ts`, labels in `web/src/i18n.tsx`, and the step lists in `web/src/components/Timeline.tsx` / `AgentConversationsCard.tsx` / `web/src/api.ts` where `send_reply` is listed; verify `npm run typecheck` and `npm run build:gui` pass

## 3. Fetch delivery path

- [x] 3.1 `taxFetch/deliver.ts`: replace the per-document loop with `verifyBatch` followed by one locked `removeFutureEmail + setFutureEmail(hints: { afterVerification: true })` and one `planner.rerun_after_verification` step, still fire-and-forget; verify `npm run typecheck` passes and that the call deliver.ts makes (`verifyBatchAndReplan`) on a collected document produces one `extract_document`, one `generate_message`, one rerun step and one draft (verified 2026-09-19 with one document; a mock fetch needs `TAX_FETCH_MOCK=true` in the user's dev stack, and the two-document batch is covered by 5.2 and the unit test)

## 4. Docs, stages, evals

- [x] 4.1 Update the `generate_message` and `extract_document` stage descriptions in `src/gemini/llmStages.ts` (order: collect → verify batch → follow-up message); verify `tests/llmStages.test.ts` passes
- [x] 4.2 Update the verification pipeline section of `docs/agents.md`; verify the text matches `specs/verification-reply/spec.md`
- [x] 4.3 Add a `generate_message` eval case with the `add-eval-case` skill: follow-up cycle (documents already `collected`, a fetch offer accepted in the same client turn) must propose the `client_agreed` fetch action; verify with the `run-evals` skill that the case passes and no other case regresses

## 5. End-to-end check

- [x] 5.1 On the local stack (user runs `npm run dev`; instance in review mode; test client `ZZ turn e2e test`, unpause it first): drive `onInboundWhatsApp` with one valid PDF (patched Twilio media fetch, as in `reply-after-full-turn`); verify exactly one outbound draft row for the turn, created after the `extract_document` call, and one `withhold_reply` + one `planner.rerun_after_verification` step
- [x] 5.2 Same with two PDFs for two different documents in one turn; verify two `extract_document` calls, two `generate_message` calls in total, and one draft (verified 2026-09-19 on the first test client, whose two rows were already pending: two extractions, one rerun step with two outcomes, one draft. On a fresh client only one row was collected — a row created in a cycle cannot be collected in the same cycle; that is unchanged behaviour)
- [ ] 5.3 Same with a PDF that fails verification (wrong year, e.g. `evals/files/leumi_balance_2024.pdf`); verify the single draft asks for a corrected document and no draft treats it as received
- [ ] 5.4 Pause the test client again, run `npm run typecheck` and `npm test`; verify both pass
