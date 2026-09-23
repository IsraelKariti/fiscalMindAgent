## Context

See proposal.md - Why. The planner is one LLM call whose JSON answer carries list changes and the message together (`decisionSchema.ts`). Its `decision` field is `goal_complete` or `follow_up`; the gate (`normalizeDecision`) requires a full message and a `send_at` for every `follow_up`, and the correction text repeats that rule. `plan.ts` decides after the apply phase whether the cycle collected anything (`verificationTargets`), withholds the draft when it did, verifies inline, and calls itself once more with the `afterVerification` hint. The follow-up cycle's prompt only differs by the VERIFICATION RESULTS section, which is empty when the batch is empty, and the code ignores collected marks in that cycle.

The evals harness builds the exact planner request (`buildDecisionCall`) and judges `expects.decision`, the message and the list changes per case.

## Goals / Non-Goals

**Goals:**
- The model writes no message when it collects; the answer says so explicitly.
- One rule, checked by the gate, that the prompt, the correction text and the evals share.
- The turn still ends with exactly one reply in every case, including the case where the code refused every tie.

**Non-Goals:**
- Splitting the planner into two calls (a list call and a reply call). The user decided against two calls per text turn.
- Starting extraction right after classification, before the planner.
- Changing which files the code accepts as ties, or the verification checks.

## Decisions

### An explicit `collect` decision value, not "null message when collecting"

`decision` becomes `goal_complete | follow_up | collect`. The model picks `collect` whenever its answer ties a file or marks a document collected; a `collect` answer leaves the message fields, `send_at`, `attestation: request` and `tax_fetch_action` null.

Why explicit: the model states its intent in one field, the gate has a crisp rule (`collect` iff the answer has ties), the trace's `validate_message` row shows the value, and the evals can expect it. The alternative, keeping two values and inferring "collecting" from empty message fields, makes a missing message ambiguous between "chose to collect" and "forgot the message", which is exactly the failure the correction text exists for.

"Has ties" means: `collected_document_ids` non-empty, or `matched_files` non-empty, or any instance in `resolved_documents` / `added_instances` with a non-empty `file_ids`. A claimed document (collected without a file) counts as a tie: the model cannot always tell whether the code will find a file, and the follow-up cycle covers the empty-batch case.

The gate rules:
- `collect` without ties: rejected.
- `follow_up` with ties: rejected.
- `collect` with a message, a `send_at`, `attestation: request` or a fetch action: rejected.
- `goal_complete` is unchanged (no message, and it cannot have ties because collected documents are not settled).

Each rejection goes through the existing one-correction pass. The correction text is rewritten to state the three-value rule instead of "every follow_up MUST include a message".

### The follow-up cycle cannot choose `collect`

`DecisionContext` gets `afterVerification: boolean`. `decisionSchemaForContext` builds the `decision` enum without `collect` for that context, so the model cannot pick it (structured output enforces the enum). The apply code keeps ignoring ties in that cycle, as today, as the last line of defence. This keeps the "cannot loop" guarantee at the schema level instead of relying on a rejection that could fail the cycle after the correction pass.

### The code keys on the decision value, and the follow-up always runs after `collect`

In `plan.ts`, the withhold branch becomes: `if (decision.decision === 'collect')` → record the deferred-reply step, verify `verificationTargets` (possibly empty), record `planner.rerun_after_verification`, reload the client, and call `planFollowUp` with the `afterVerification` hint. `shouldWithholdDraft` and its test are replaced by this rule (its two inputs are now the decision value and the hint). Keying on the decision value rather than on `verificationTargets` is what makes the empty-batch case safe: a `collect` answer has no message, so the follow-up must run even when nothing reached verification.

The `verificationResults` hint may be an empty array. `buildVerificationResultsSection` is rendered whenever the hint is set: with results it reads as today; with none it says that no file of this turn was verified and that this answer may not collect. The hint therefore needs to distinguish "not set" from "set and empty" (`afterVerification` is the flag, `verificationResults` the list).

### The trace step keeps its key

`withhold_reply` stays the audit action so older rows keep working with the timeline glyph and the modal. Its label changes to "Reply deferred (awaiting verification)" and its detail keeps `reason: 'awaiting_verification'` and the document names. No spec other than `verification-reply` names the step.

### Evals

`expects.decision` accepts `collect`. For a `collect` answer the judge checks: the gate accepted it, no message field is filled, `send_at` is null, and the existing list-change checks (`added_instances`, `new_instance_file_ids`, `matched_file_ids`) still run. Cases `dec_13` and `dec_18` (a file the client confirms as a new item, with `new_instance_file_ids`) now expect `collect` and drop their message checks. Two cases are added: a file whose content analysis matches an existing pending row (expects `collect` with `matched_file_ids`), and the empty-batch follow-up (the `afterVerification` hint with no results, expects `follow_up` with a message and no ties). `dec_11` already covers the follow-up with results.

## Risks / Trade-offs

- [The model keeps writing a message with `collect` out of habit] → the gate rejects it and the correction pass names the rule; the evals cases catch a model that does it consistently.
- [The model chooses `follow_up` and asks about a file it should have tied] → this is the existing "unlisted file" behaviour, unchanged; the gate only rejects `follow_up` when the answer itself contains ties.
- [One more planner call in the claimed-only or all-refused case] → today those cases end in one call; after this change they end in two (a short `collect` answer and the reply). Rare, and the alternative (asking the model to predict the code's tie decision) is worse.
- [A `collect` answer on a timer-driven run (manual retry, overdue scan) when an unpaired file sits in the thread] → same path as an inbound turn: verify, then reply. No new state.

## Migration Plan

Deploy as code only. No migration, no data change. Old trace rows render with the new label. Rollback is a revert.
