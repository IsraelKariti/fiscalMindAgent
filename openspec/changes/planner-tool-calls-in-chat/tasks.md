## 1. Carry the calls and the recorder

- [x] 1.1 `decide()` (`src/agents/declarationOfCapital/decide.ts`) returns the gate-accepted `calls` next to `decision`; `askPlanner` stores them on `PlanRun.calls`; verify `npm run typecheck` and the existing decision tests still pass
- [x] 1.2 Add the twelve tool names to `AuditAction` (`src/audit/audit.ts`), mark `apply_*`, `send_reply`, `withhold_reply` as legacy (comment, no writer), and add a unit test that every `DECISION_TOOL_NAMES` entry is an `AuditAction`; verify `npm test`
  The check is compile-time: `tests/toolStepDetails.test.ts` types `[...DECISION_TOOL_NAMES]` as `AuditAction[]`.
- [x] 1.3 Add `recordToolStep(run, call, outcome, target)` in `plan.ts` (action = tool name, detail = `{ turn?, params with names, outcome }`); verify a unit test of the detail builder (`tests/toolStepDetails.test.ts`) for a `tie_file` and a `resolve_document` call
  Detail builders live in `toolStepDetails.ts` (one module for the builders and the attribution, instead of a separate `toolStepOutcomes.ts`); tests in `tests/toolStepDetails.test.ts`.

## 2. Checklist and attestation steps

- [x] 2.1 `applyResolutions` records one `resolve_document` step per call (document name, verdict, quote or self-evident file, instance names) and writes no `apply_resolutions`; `applyRetirements` → `retire_document`; `applyStatedCosts` → `state_cost`; `applyVehicleDeclarations` → `state_vehicle`; `applyAttestationConfirmed` → `attestation` (confirmed); verify `npm test` with the detail builder tests extended per tool and `grep` shows no writer of the old names
- [x] 2.2 `applyAdditions` creates the rows as today but the `add_instance` step is written in `collectFiles` after `assignFilesToNewRows`, with the created rows' names, the assigned files and the refused files; verify a unit test and that `document.instances_added` is still written at creation

## 3. Ties, collections and the conclusion

- [x] 3.1 Add the pure `attributeCollectionOutcome(calls, outcome, run)` (new module `toolStepOutcomes.ts`): one record per `tie_file` (tied / re-pointed with the split entries of its file / refused with reason) and per `mark_collected` (collected / claimed / pending with reason / not pending); verify unit tests covering the three-company split, a refused tie that leaves the document pending, a claim, and a tie to a quarantined file
  Built as `attributeCollectionOutcome` in `toolStepDetails.ts`; also covers an unknown file / document and the after-verification skip.
- [x] 3.2 `collectFiles` records the attributed `tie_file` and `mark_collected` steps in call order and no `apply_collections`; delete `recordApplyCollectionsStep` and `collectionsStepDetail`; verify `npm test` and `npm run typecheck`
- [x] 3.3 `planFollowUp` writes the `conclude` step after the apply phase: decision, reasoning, and the branch outcome (collect → verification targets and "reply withheld", from `verifyThenReplan`; goal_complete → completed or premature; follow_up → message scheduled; client_declined → decline routine); retire `withhold_reply`; verify a plan test per branch asserting the `conclude` row and the absence of `withhold_reply`
  `plan.ts` has no DB-free tests; the `conclude` detail of every branch is unit-tested (`concludeDetail`), the wiring is in `planFollowUp`, `verifyThenReplan`, `completeGoalIfDone`.

## 4. Message and fetch steps

- [x] 4.1 `scheduleReply` records `send_whatsapp_text` or `send_whatsapp_template` (requested time, scheduled time, rolled, resolved-from-asap, emailId, chars, template name and variables) and no `send_reply`; `applyAttestationRequest` records `attestation` (request, emailId); verify the plan tests and `tests/stepSummary.test.ts` on the new detail
- [x] 4.2 Wrap `applyTaxFetchAction` so the `tax_fetch` step records action, provider, keys and the flow's result; verify a unit test with the mock fetch provider
  Recorded by `recordTaxFetchStep` after `applyTaxFetchAction` in both call sites (scheduleReply, completeGoalIfDone); the detail is unit-tested, no mock-provider run.
- [x] 4.3 `adminGetClientConversation` matches discarded drafts on `send_reply`, `send_whatsapp_text` and `send_whatsapp_template`; verify `tests/timelineRows.test.ts` extended with a `send_whatsapp_text` fixture

## 5. Web

- [x] 5.1 Add `web/src/components/stepGlyph.ts` (critical, email, tool 🛠️, legacy and code-only ⚙️, else 🛡️) and use it in `Timeline.tsx` and `AgentConversationsCard.tsx`; add the twelve labels to `stepActionLabels` in `i18n.tsx`; verify `npm run build:gui` and a unit test of `stepGlyph`
- [x] 5.2 Add one renderer per tool step to `stepSummary.ts` (params and outcome as labelled rows, names over ids, unknown keys generic) and keep the old renderers; verify `tests/stepSummary.test.ts` extended per tool step and `tests/stepLink.test.ts` on a `tie_file` row
  One shared mapping for the twelve tool steps (flat detail: `tool` dropped, booleans yes/no, the rest generic); `tests/stepLink.test.ts` unchanged (it tests the text format on an old row, which still applies).
- [ ] 5.3 Browser check under impersonation on a local client: a collect cycle shows `validate_message` (shield), `tie_file`, `mark_collected`, `conclude` (tool icon) with their outcomes in the modal; a follow-up cycle shows `send_whatsapp_text`; an old client's trail still shows its `apply_collections` and `send_reply` rows

## 6. Docs and close

- [x] 6.1 Update `docs/pipeline.md` (apply-phase table: one row per tool step, `conclude`, retired names) and `docs/agents.md` (apply phase, trace section); verify a read-through and `grep` for the old names finds only the "legacy rows" mentions
- [ ] 6.2 Run `npm test` and `npm run typecheck`; commit per the git workflow; then `/opsx:archive planner-tool-calls-in-chat` with "Sync now"
