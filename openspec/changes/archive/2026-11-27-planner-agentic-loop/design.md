## Context

Today's planner (openspec `planner-answer-tools`, change `planner-tool-calls`, built 2026-10-14, not archived) answers in one shot: `decide.ts` sends the prompt, the model returns tool calls ending in `conclude`, `gateDecision` judges the whole set (`parseToolCalls` → `assembleDecision` → `normalizeDecision`), and `planFollowUp` applies the calls in a fixed order. A tie makes the answer a `collect` decision with no message; `verifyThenReplan` verifies inline and re-runs the planner with `afterVerification` and a VERIFICATION RESULTS prompt section. On OpenAI, `runOpenAiToolTurns` already loops one call per turn, answering every call with the literal `recorded`; Anthropic and Gemini get a single turn with a forced tool choice.

Constraints that shape the design:

- The three provider adapters (`gemini/generate.ts`, `anthropic.ts`, `openai.ts`) are translation layers over one Gemini-shaped request; `requestLog.ts` stores "the request as sent" and the calls as the response (`conversation-trace`).
- Verification (`verifyDocument.ts` · `verifyBatch`) takes 20 to 90 seconds per file (one `extract_document` LLM call) and already runs inside the planner cycle under the client lock, so wall time inside a planner run is not new.
- The evals harness (`evals/stages.ts`) builds the exact app request with `buildDecisionCall` and judges the calls with the gate; it has no database, so it cannot execute tools.
- Anthropic prompt caching (`planner-prompt-caching`) keys on the system prompt prefix; continuation turns keep it.
- Memory: OpenAI reasoning models (gpt-5.x, gpt-6-x) make one action call per turn; gpt-6-astra is the production backup model.

## Goals / Non-Goals

**Goals:**

- One planner run per client turn, on every provider, in which a tie's verdict is a tool result and the message is written after it.
- No rule that the model must keep "in its head" across calls: every rule that depends on an earlier call is enforced by refusing the later call with a reason.
- The trace and the call modal show every turn, every call, and the exact text the model was given back.
- The evals harness keeps judging the planner against the same prompt and tools, with canned results.

**Non-Goals:**

- Changing the document check itself (`verifyDocument.ts` internals, extraction prompts, checks).
- Changing the fetch-delivery path beyond dropping `afterVerification` (it still verifies first and runs one planner afterwards).
- Streaming or parallel execution of tool calls across turns.
- Changing other LLM stages (they answer with one JSON object and stay so).

## Decisions

### D1. A provider-neutral tool loop driven by an executor callback

`runLlmCall` gets an optional `execute(calls, turn) → results[]` on the spec (only with `tools`). The loop lives in one place, `gemini/toolLoop.ts` (new, pure over an injected `send`), and each adapter only translates one turn: build the request for turn N from the conversation so far (prompt, prior tool calls, prior results, corrective user turns), send, read calls and text. `toolTransport.ts` keeps the three wire translations and gains the result shapes: Anthropic `tool_result` blocks keyed by `tool_use_id`, Gemini `functionResponse` parts, OpenAI `function_call_output` with the result text instead of `recorded`. `runOpenAiToolTurns` is replaced by the shared loop (OpenAI keeps `previous_response_id`).

Alternative considered: keep the OpenAI-only continuation and add a second planner call after verification for the other providers. Rejected: it keeps the "collect" split the change exists to remove, and keeps two code paths.

### D2. Tool choice `auto`; terminal tools end the loop; a text-only turn is the fallback end

`tool_choice` goes from forced (`any` / `required` / `ANY`) to `auto`. The loop stops after a turn in which a terminal call was accepted (no extra turn is bought for a "done" message). A turn with no calls and no accepted terminal call so far gets one corrective user turn with the ending rule; a second such turn fails the run. Text in a turn is stored, never sent.

Alternative: keep a forced tool choice so the model can never answer text only. Rejected: forced choice is what produced the "forced enum" class of mistakes (memory `anthropic-null-enum-forced`), and a model with nothing to say would be pushed into a bad call rather than told the rule.

### D3. Per-call rules instead of whole-answer normalization

`decisionSchema.ts` is split: the per-call validators (`validateResolutions`, `validateAddedInstances`, `validateRetirements`, `validateSetCompanies`, `validateStatedCosts`, `validateStatedVehicles`, `validateAttestation`, `validateMatchedFiles`, `validateDocumentFetch`, the window/template rules, `validateTeamQuestion`) each become a `judgeCall(call, ctx) → accepted | refused(reason, checks)` over the live `DecisionContext`, which is rebuilt from the database after every turn (the checklist changes between turns). `assembleDecision` and `normalizeDecision` disappear with the decision enum; `DECISION_VALUES`, `afterVerification`, `answerTiesFiles` and the collect/follow-up separation go with them. Cross-call rules become state on the run: `RunState { ended: terminal | null, asked: boolean, tied: boolean, changedChecklist: boolean, createdRows: Map<name, id> }`, consulted by the judges (`client_declined` after a tie; second `ask_team`; a call after the ending).

Within one turn, calls still execute in the fixed safe order (same as today's `planFollowUp` order) so `state_cost` by `instance_name` keeps working for a same-turn `add_instance`; across turns the model uses the id the result returned.

### D4. The tie executes the verification and returns the verdict

`collectFiles` + `pickVerificationTargets` + `verifyBatch` move behind the executor of `tie_file` / `mark_collected` / `add_instance`-with-files: the turn's ties are collected as one group (the split and company logic of `collectFiles` is per group, unchanged), the group is verified as one batch, and each call's result is built by a pure `tieResultText(outcome, verdict)` in `toolStepDetails.ts`: approved + the key facts the check read (from the row's `verification` JSON: as-of date, the typed amount fields by Hebrew label), rejected + `reasons`, claimed, could-not-verify, refused + reason. The same text is stored on the step (`result` key) and returned to the model. `verifyThenReplan`, `recordRerunAfterVerification` for planner ties, and the `withhold_reply`/deferred-reply step are deleted; `verifyBatchAndReplan` (fetch delivery) keeps its one follow-up run, now without `afterVerification`.

### D5. The run ending is code, the `conclude` step is code-written

`planFollowUp` becomes: load context → loop (per turn: gate row → execute → results) → ending. The terminal executors do what the decision branches did: `send_*` → `scheduleReply` (stores the call's `reasoning` on the draft; `applyAttestationRequest` and `applyDocumentFetchAction` ride on it as today, taken from accepted calls of the run); `goal_complete` → `completeGoalIfDone` (refuses when not done instead of throwing); `client_declined` → `handleClientDecline`. `recordConclude` writes the `conclude` step from the run state (ending kind, draft, reasoning, turns, or failure), so the web step summary keeps working with new keys added (`turns`, `ended_by`).

### D6. Gate rows per turn

`validate_message` is recorded once per turn (detail: `turn`, `result`, `checks`): `tool_calls`, one `business_rules` entry per call (refusals as failed entries), and `ending` on the last turn. `describeCalls` and the correction text are reused for the `ending` note. The `tool_calls` failure of a single call (unknown tool, bad shape) is answered to the model as that call's result and does not block the other calls of the turn.

### D7. Call record and modal

`requestLog.ts` stores `continuation: { terminalTools, maxTurns }` and the response as `[{ name, args, turn, result }]` plus `texts: [{ turn, text }]`. The modal (`LlmCallModal` tool-calls pane) shows the result under each call and the turn count; `withNamedIds` keeps naming ids. Old rows (calls without `result`, a `conclude` call) render as before.

### D8. Evals: canned results

`evals/stages.ts` planner stage passes an `execute` that returns canned results: per case an optional `tool_results` map (tool name → text, or tool name + document id → text), with defaults ("tied; verification: approved" for a tie, "created row eval-<n>" for `add_instance`, "scheduled" for a send). The judge reads the run: `ending` (`message` / `goal_complete` / `client_declined` / `none`), `ties` count, the message body checks as today. Case expectations move from `decision` to `ending` (+ `ties: ">0"` where `collect` was expected). `run-evals` and `add-eval-case` skills are updated to the new keys.

### D9. Prompt

`prompt.md` action 4 (the four decisions) is rewritten as "how a run ends": call tools, read their results, end with exactly one of the four terminal tools; a tie's result is the verdict, write the message after it; a refused call explains itself, correct it in the next call; never write the message as plain text. The VERIFICATION RESULTS section stays only for fetch batches. The status glossary line for `collected` ("now being verified") goes, since the model always sees the verdict in the same run.

## Risks / Trade-offs

- [A refused call applied nothing but its turn-mates did; a failed run leaves ties applied and no message] → the next run (quiet window, reminder, or manual redraft) sees the changed state; the `conclude` failure step and the existing `planner.failed` path alert as today. Documented in `verification-reply`.
- [Longer planner runs on Gemini/Anthropic: at least two turns when a file is tied] → still fewer tokens than today's two separate planner calls (the prefix is cached; only the results and the second answer are new).
- [Gemini `auto` tool choice may answer text only on the first turn] → the corrective turn; evals pin it per model before the production model is switched.
- [Anthropic `tool_result` requires every `tool_use` id of the turn to be answered] → the loop always returns one result per call, refused calls included.
- [Per-call judges lose whole-answer context (for example two `set_required` on one row in one turn)] → the run state and the live `DecisionContext` rebuilt per turn cover the cases the spec names; the second call of a pair is refused as a no-op ("already resolved in this run").
- [Twelve turns of a slow model could exceed the BullMQ job lock] → the run already extends the client lock per verification; the job's lock renewal is checked in task 7.3 and the cap can be lowered by env if needed.
- [Old eval cases and the Notion animation describe the collect cycle] → tasks migrate the cases and update the Notion page and the "Agent Message Flow" animation.

## Migration Plan

1. Archive `planner-tool-calls` first (its remaining tasks are live checks the owner skipped) so `openspec/specs/planner-answer-tools/spec.md` exists and this change validates against it.
2. Build behind no flag: the planner contract changes for every provider at once; old call records and trace rows stay readable.
3. Deploy to sandbox (push to master), run one planner turn with a file on each provider key available, read the trace, then promote to production. Rollback is a revert of the merge commit; no migration is needed (no schema change: the call record is JSON).

## Open Questions

- Whether the result of an approved tie should include every typed field the check read or only the as-of date and the first money field; the spec says "the facts that matter for the reply", the first implementation returns the as-of date plus every typed money field by Hebrew label, and the evals can tighten it later without changing the specs.
