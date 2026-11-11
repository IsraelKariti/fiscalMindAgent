## Context

- `planFollowUp` (`src/agents/declarationOfCapital/plan.ts`) runs: `askPlanner` → `decide` (gate inside) → `applyResolutions`, `applyAdditions`, `applyRetirements`, `applyStatedCosts`, `applyVehicleDeclarations`, `settleChecklistChanges`, `applyAttestationConfirmed`, `collectFiles`, then `verifyThenReplan` (collect), `completeGoalIfDone` (goal_complete) or `scheduleReply` (follow_up) with `applyAttestationRequest` and `applyTaxFetchAction` inside.
- Each apply function loops over one field of the assembled `NormalizedDecision` and writes one group row (`recordPlannerStep(run, 'apply_*', ...)`) through `recordAudit`. `collectFiles` is a group computation over all ties and collections: `applicableFilePairs` → `filterPairsByCompany` → `splitItemsByCompany` (`planCompanySplit`) → `assignFilesToNewRows` → `decideCollectOrClaim` → `markCollected`/`markClaimed`/`linkFilesToDocuments` → `recordApplyCollectionsStep`.
- The gate (`gateDecision` in `decisionTools.ts`) parses the calls, `assembleDecision` merges them into the decision object, `normalizeDecision` runs the business rules. `decide()` returns only `decision`; the calls are stored in the LLM call record.
- The web renders a step row in `Timeline.tsx` (`StepRow`, glyph by action prefix) and in `AgentConversationsCard.tsx`; `stepSummary.ts` has one renderer per action; `i18n.tsx` `stepActionLabels` maps action → label. `AuditAction` in `src/audit/audit.ts` is a closed union.
- `adminGetClientConversation` flags a discarded draft's step by `action === 'send_reply'` and `detail.emailId`.

## Goals / Non-Goals

**Goals:**
- One audited step per accepted tool call, named after the tool, at the time it ran, with parameters (ids + names) and outcome.
- Group outcomes attributed to the call that caused them, without changing what the code decides.
- Old trails render unchanged.

**Non-Goals:**
- No change to the tools, the prompt, the gate checks, the corrective retry, the evals harness, the call modal or `#/llm-stages`.
- No change to the order or the logic of the apply phase: the company split, the collect-or-claim rule, the tie refusals, the send-time roll all stay as they are. Only the recording changes.
- Removing the internal decision object (`assembleDecision` → `NormalizedDecision`) is NOT part of this change. It is invisible to the user (no trace step), it is what the business-rule validators and the evals run on, and replacing it is a large refactor with no visible effect. The calls are carried next to it (decision 1), so the record is per call.

## Decisions

1. **Carry the accepted calls through the cycle.** `decide()` returns `{ decision, calls, usage, model }` where `calls` is the gate-accepted list (`LoggedToolCall[]`, with `turn`). `askPlanner` stores them on `PlanRun` (`run.calls`). Every apply function reads the decision as today and finds, for each row it applies, the call it came from (by document id / file id / instance name, in call order), so the step carries the call's own parameters. Alternative rejected: re-deriving calls from the decision object loses the evidence fields and the call order.

2. **Recorder per call: `recordToolStep(run, call, outcome)`.** One helper writes an audit row with `action = call.name` (new `AuditAction` members), `targetType`/`targetId` of the main document or file, and `detail = { turn?, params: <args with names resolved>, outcome: {...} }`. `recordPlannerStep` stays for the code-only rows (`goal.completed`, `send_closing`, `planner.rerun_after_verification`). The `apply_*` / `send_reply` / `withhold_reply` members of `AuditAction` stay in the union for old rows but no code writes them (a comment marks them legacy).

3. **Outcome attribution in `collectFiles`.** The group computation runs unchanged and returns `CollectionOutcome` as today. After it, a pure function `attributeCollectionOutcome(calls, outcome, run)` builds one record per `tie_file` call (tied → row id it ended under; re-pointed by the split → the rename/created entries of `splitDetail` whose file id equals the call's file id; refused → reason from `refusedTies`; quarantined/parent → reason) and one per `mark_collected` call (collected / claimed / pending-with-reason / not-pending), then `recordToolStep` per record, in call order. Unit-tested on fixtures. `recordApplyCollectionsStep` and `collectionsStepDetail` are deleted. `document.collected` / `document.claimed` audit rows stay (security events, shield).

4. **`add_instance` files and claimed-at-creation.** `applyAdditions` records one `add_instance` step per call with the rows created, their names, the file ids assigned later by `assignFilesToNewRows`? No: assignment happens in `collectFiles`, after. The `add_instance` step records the rows and the files the call named; the `tie_file`-like result of those files (accepted / refused by `assignFilesToNewRows`) is recorded as an outcome update on the same step? Audit rows are append-only, so instead: `collectFiles` records the new-row file results as part of the matching `add_instance` call's... impossible after the fact. Decision: the `add_instance` step is written inside `collectFiles` (after assignment), not in `applyAdditions`, so it carries rows + assigned/refused files in one row. The creation audit (`document.instances_added`) stays where it is. Order of rows in the trace is by time, so `add_instance` appears after `resolve_document` and before `tie_file`, which reads naturally.

5. **`conclude` step.** Written once by `planFollowUp` after the apply phase: decision, reasoning, and the branch outcome: for `collect`, `verifyThenReplan` returns the verification targets and the step lists them (replaces `withhold_reply`); for `goal_complete`, `completeGoalIfDone` result; for `follow_up`, "message scheduled" (the `send_whatsapp_*` step follows); for `client_declined`, written before `handleClientDecline`. The `withhold_reply` row is retired.

6. **Message and fetch.** `scheduleReply` records `send_whatsapp_text` or `send_whatsapp_template` (by `message.kind`) with the fields `send_reply` records today plus `requested_send_at`, `rolled`, template name and variables. `applyAttestationRequest` records `attestation` (action request, emailId). `applyAttestationConfirmed` records `attestation` (action confirmed, evidence). `applyTaxFetchAction` is wrapped so the `tax_fetch` step records action, provider, keys and the flow's result.

7. **Web.** `Timeline.tsx` and `AgentConversationsCard.tsx` share a `stepGlyph(step)` helper (`web/src/components/stepGlyph.ts`): critical → ⛔, accountant email → ✉️, action in `PLANNER_TOOL_STEPS` → 🛠️, legacy `apply_*`/`send_reply`/`withhold_reply` → ⚙️ (old rows), other code actions (`send_closing`, `send_decline_ack`, `planner.rerun_after_verification`, `goal.completed`) → ⚙️, else 🛡️. `stepActionLabels` gets the twelve tool names as their own labels (technical names, per the "Workflow step names" rule). `stepSummary.ts` gets one renderer per tool step reading `params` and `outcome`; the old renderers stay for old rows.

8. **Discarded-draft matching.** `adminGetClientConversation` treats `send_reply`, `send_whatsapp_text` and `send_whatsapp_template` alike; `timelineRows.ts` is unchanged (it reads the `discarded` flag).

## Risks / Trade-offs

- [More rows per cycle in the trace] → each row is one line; the code steps toggle hides them all, as today.
- [A tool call matched to the wrong decision row when two calls name the same document] → matching is by call order within the same tool and the same id, which the gate already requires to be unique per document (`validateResolutions`, `validateMatchedFiles`).
- [Old tests and specs name the old steps] → tests are rewritten for the new steps; the old renderers keep their tests for old rows; the redirect requirement in `conversation-trace` covers the three other specs.
- [`AuditAction` union grows by twelve] → they are the tool names; a test asserts every `DECISION_TOOL_NAMES` entry is an `AuditAction`.

## Migration Plan

No migration. Deploys with the next release; old rows need nothing. `docs/pipeline.md` and `docs/agents.md` are updated in the same change (the apply-phase table lists the tool steps).
