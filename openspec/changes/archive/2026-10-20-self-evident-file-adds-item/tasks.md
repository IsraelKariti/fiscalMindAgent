## 1. Self-evident file rule (pure)

- [x] 1.1 Create `src/agents/declarationOfCapital/selfEvidentFiles.ts` with `selfEvidentFilesOf(files, { clientName, spouse }, institutions?)` returning the pool described in design.md decision 1 (institution-bound type, verified legible, not split parent, unattached, unmatched, confidence high, issuer identified, holdings non-empty and not partial, every holder printed and loosely matching the client or the spouse); verify with a new `tests/selfEvidentFiles.test.ts` covering the seven scenarios of the spec requirement "A file in the client's name proves its own list item" (`npm test`).
- [x] 1.2 Add the `SelfEvidentFileEvidence` variant (`source: 'self_evident_file'`, file_id, issuer, holders, matched, employer?) to `ResolutionEvidence` in `src/db/types.ts` and to `EvidenceRef` in `decisionSchema.ts`; verify `npm run typecheck` passes.

## 2. Decision gate

- [x] 2.1 Add `proven_by_file_id` (plain string, '' = none) to the `resolve_document` tool and to `resolved_documents` entries; update the tool descriptions of `resolve_document` and `add_instance`; verify `tests/decisionTools.test.ts` and `tests/anthropicSchema.test.ts` pass.
- [x] 2.2 Add `selfEvidentFiles` to `IntakeDecisionState`; extend `validateProvenByFile` with the self-evident branch (file in the pool, type equals the row's/anchor's type, exactly one instance; otherwise fall through to the property-paper rules); route `validateResolutions` (required only) and `validateAddedInstances` through it; verify with new `tests/intakeDecision.test.ts` cases: accepted resolution, accepted addition, cited file not in pool, cited file of another type, two instances on one file, quote wins over citation, `not_required` with a file rejected.

## 3. Applying the decision

- [x] 3.1 In `plan.ts` build the pool in `buildIntakeState` (client name, `readSpouse(agent_fields)`, the client's files) and pass it to the prompt input; verify by a unit test or a `tsx` script that the pool of the Phoenix-like fixture holds the file.
- [x] 3.2 When a resolution/addition carries self-evident evidence: finish the instance name with `companySuffixedName` and (employer-bound types) `employerSuffixedName`, union the cited file into the instance's `fileIds`, store the evidence on the row(s) (resolution + instance), and let `assignFilesToNewRows` tie it; verify with `tests/fileTies.test.ts` (tie accepted for an identified same company) and an `intakeDecision`/plan-level test that the created name is "… — הפניקס — אלעד מערכות תוכנה" and that an unlisted cited file is still tied.
- [x] 3.3 Show the creation in the trace: `applyStepDetails.ts` lists the item as created from a file in the client's name (issuer, holder); verify the `apply_collections` / resolution step detail in a unit test or by reading a local step with `npm run step`.

## 4. Planner prompt

- [x] 4.1 `prompt.ts`: append the marker "self-evident: in the client's name — may be added without asking (proven_by_file_id)" (or "in the spouse's name") to the analysis line of a pooled file only; verify with a prompt unit test (marker present for a pooled file, absent otherwise).
- [x] 4.2 `prompt.md` § "קובץ שאינו שייך לרשימה": add the self-evident case (cite the file on `resolve_document`/`add_instance`, name with the company, `collect`, never ask; other unmatched files are asked about in the follow-up reply) and keep the existing case for files without the marker; update the `add_instance` / `proven_by_file_id` wording in § 1ב; verify the prompt fixture tests pass (`npm test`).

## 5. Workspace and audit

- [x] 5.1 `web/src/api.ts` evidence source union + `DocumentsCard.tsx` label "נוצר מקובץ על שם הלקוח — <issuer>" for `self_evident_file`; verify `npm run typecheck` and a browser look at a local client whose item was created this way.
- [ ] 5.2 Confirm the item-creation audit row carries the new evidence object (no new action); verify by reading the audit event of a locally created item.

## 6. Evals and docs

- [ ] 6.1 Add two planner cases to `evals/cases/generate_message.json` with `/add-eval-case`: (a) Phoenix-like self-evident study fund file, study fund row `not_required` → expects `resolved_documents` required with `proven_by_file_id`, one instance, decision `collect`, no message; (b) the same file with holder hidden → expects no list change and a message that asks whose fund it is; verify both pass with the configured models (`/run-evals generate_message`) and no previously passing case regresses.
- [x] 6.2 `docs/pipeline.md`: add rows for `selfEvidentFilesOf` (pool) and the self-evident branch of `validateProvenByFile`, and update the `proven_by_file_id` row; verify the table reads correctly.
- [ ] 6.3 Live check on the local stack: send a study fund report in the test client's name for a fund not on the list, confirm the item appears with the file attached, the cycle is `collect`, the follow-up reply reports the verification and asks nothing about the file; then commit per the Git workflow.
