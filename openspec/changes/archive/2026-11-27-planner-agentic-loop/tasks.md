## 1. Prerequisites

- [x] 1.1 Archive `planner-tool-calls` with "Sync now" (its open tasks 6.4 and 7.3 are owner live checks; record them as skipped) so `openspec/specs/planner-answer-tools/spec.md` exists; verify `openspec validate --change planner-agentic-loop` passes

## 2. The tool loop (gemini/, pure code first)

- [x] 2.1 Add `src/gemini/toolLoop.ts`: `runToolLoop(first, send, execute, { terminalTools, maxTurns })` over an injected `send(turnRequest) → { calls, text, usage, raw }`; stops after a turn with an accepted terminal call, after a second text-only turn (one corrective user turn in between), or at `maxTurns`; returns calls with `turn` and `result`, per-turn texts, summed usage; verify with unit tests in `tests/toolLoop.test.ts` covering: terminal on turn 1, tie-then-send, refused call continues, text-only then send, two text-only turns fail, cap reached, every call of a turn gets a result
- [x] 2.2 Extend `toolTransport.ts` with the result shapes: Anthropic `tool_result` blocks (one per `tool_use` id), Gemini `functionResponse` parts, OpenAI `function_call_output` with the result text; `tool_choice` `auto` on all three; verify the wire-shape unit tests in `tests/toolTransport.test.ts` pin each
- [x] 2.3 Wire the loop into `llmCall.ts` (`LlmCallSpec.execute`, `terminalTools`, `MAX_TOOL_TURNS = 12`, `finalTool` removed) and the three adapters (`generate.ts`, `anthropic.ts`, `openai.ts`) so each adapter sends one turn built from the conversation so far; delete `runOpenAiToolTurns` and `CONTINUATION_RESULT`; verify `npm run typecheck` and the adapter tests pass
- [x] 2.4 `requestLog.ts`: store `continuation: { terminalTools, maxTurns }` on the request and `[{ name, args, turn, result }]` + `texts` as the response; keep old rows readable; verify `tests/requestLog.test.ts`

## 3. Per-call rules and executors (declarationOfCapital/)

- [x] 3.1 `decisionTools.ts`: remove `conclude`; add `goal_complete(reasoning)` and `client_declined(reasoning)`; add `reasoning` to the two send tools; `toolsForContext` without `afterVerification`; shape test updated (no nullable/optional/nested, at most 20 tools); verify `tests/decisionTools.test.ts`
- [x] 3.2 `decisionSchema.ts`: `normalizeChanges` judges one unit of calls (today's validators over the live context); the per-call judges and the run-state refusals live in `decisionJudge.ts` (`judgeChecklistUnits`, `judgeTies`, `judgeAskTeam`, `judgeDocumentFetch`, `judgeMessage`, `judgeGoalComplete`, `judgeDecline`, `judgeRun`); `DECISION_VALUES`, `afterVerification`, `answerTiesFiles` deleted; refusal texts equal the old gate notes; verified by `tests/decisionJudge.test.ts` (second message, `client_declined` after a tie, `ask_team` after the message, `goal_complete` while a row is pending) and the adapted `tests/intakeDecision.test.ts`
- [x] 3.3 `plan.ts`: rebuild `planFollowUp` as load → loop → ending; executors per tool in the fixed order within a turn, each returning a result text; `DecisionContext` rebuilt after every turn; `verifyThenReplan` and the deferred-reply step deleted; `scheduleReply` stores the send call's `reasoning`; `completeGoalIfDone` refuses instead of throwing; `handleClientDecline` from the `client_declined` executor; verify `npm run typecheck` and `tests/plan*.test.ts`
- [x] 3.4 Tie executor: the turn's `tie_file` / `mark_collected` / `add_instance`-with-files calls collected as one group through `collectFiles`, verified as one batch, each call answered by `tieResultText` (approved + as-of date + typed money fields by Hebrew label; rejected + reasons; claimed; could not verify; refused + reason) in `toolStepDetails.ts`; processing stamp during the batch, drafting stamp after; verify unit tests of `tieResultText` on fixture verification rows and one integration test with a stubbed `verifyBatch`
- [x] 3.5 `verifyDocument.ts` / `documentFetch/deliver.ts`: `verifyBatchAndReplan` keeps one follow-up run without `afterVerification`; `recordRerunAfterVerification` only on that path; verify `tests/verifyDocument*.test.ts`
- [x] 3.6 Gate rows: `validate_message` per turn (`turn`, `tool_calls`, one `business_rules` entry per call, `ending` on the last turn) in `decide.ts`; the corrective user turn text for a text-only turn; verify `tests/decide.test.ts` on the row shapes of the three scenarios of the `code-gates` delta
- [x] 3.7 Steps: every call (accepted or refused) recorded with `turn` and `result`; code-written `conclude` step (`ended_by`, draft, reasoning, `turns`, or failure as warning); `goal_complete` and `client_declined` step details; verify `tests/toolStepDetails.test.ts`
- [x] 3.8 Prompt: rewrite action 4 of `prompt.md` as the loop and ending rules (terminal tools, results, refusals, never plain text), drop the `collect` wording and the `collected = being verified` glossary line, VERIFICATION RESULTS only for fetch batches; update `prompt.ts` and the prompt fixture tests; verify `tests/prompt*.test.ts`

## 4. Web

- [x] 4.1 Call modal tool-calls pane: result text under each call, turn count and "turn N of M", loop rule in the request pane; old records unchanged; verify `npm run build:gui` and a unit test of the pane's data mapping
- [x] 4.2 Step summary / glyph: new keys of the code-written `conclude`, steps `goal_complete` and `client_declined` as tool steps, `result` row in the step modal; verify in the browser on a local run
- [x] 4.3 `#/llm-stages`: planner text states the loop and the terminal tools (`llmStages.ts`); verify the page

## 5. Evals

- [x] 5.1 `evals/stages.ts` planner stage: pass an `execute` with canned results (`tool_results` per case, defaults per tool); judge `ending`, `ties`, message checks; migrate `evals/cases/planner.json` expectations from `decision` to `ending` (+ `ties`); update `.claude/skills/run-evals` and `add-eval-case`; verify `npm run evals -- --stage planner --models <local model>` runs and the report renders
- [x] 5.2 Add two planner cases: a tie whose canned result is "rejected: as-of date" and the message must say rejected with the reason (`dec_48`); the text-only first turn followed by a send cannot be scripted against a real model, so it is pinned by the loop unit test instead (`tests/toolLoop.test.ts`, "a text-only turn gets one corrective user turn"); the evals run itself is left to the owner (it spends on the model)

## 6. Docs

- [x] 6.1 `docs/pipeline.md` section D (loop, executors, ending, `conclude` code-written, `verifyThenReplan` removed) and `docs/agents.md`; `CLAUDE.md` step-link notes unchanged; verify the function names in the table exist (`grep`)
- [x] 6.2 Notion: Features page of the planner and the "Agent Message Flow" animation updated to the loop (tie → verdict → message), per `STYLE.md`; verify the page renders the new chart

## 7. Live checks and release

- [ ] 7.1 Local end-to-end with a test client: one file turn on Gemini (local key) — trace shows `validate_message` (turn 1), `tie_file` with the verdict result, `validate_message` (turn 2), `send_whatsapp_text`, `conclude`; call modal shows two turns with results; verify in the browser
- [ ] 7.2 Same turn on Anthropic and OpenAI if keys exist (sandbox otherwise): the OpenAI run shows one call per turn with real results instead of `recorded`; verify in the trace
- [ ] 7.3 Check the replan worker's job lock renewal covers a 12-turn run with two verifications (read `queue/replanWorker.ts`, lock duration vs. measured run time); lower `MAX_TOOL_TURNS` or extend the lock if not; verify with one timed local run
- [ ] 7.4 Commit per the git workflow, deploy to sandbox, run one real WhatsApp file turn there and read its trace; then promote to production and confirm one live planner run; then `/opsx:archive planner-agentic-loop`
