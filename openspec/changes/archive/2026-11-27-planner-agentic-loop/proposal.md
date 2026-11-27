## Why

The planner answers in one shot: it must call `conclude` with a decision label, and a file tie must be a separate "collect" answer with no message, because the file is only verified after the answer and the reply must know the verdict. The model has to hold that rule across its calls on its own. On 25 Nov 2026 the production planner (gpt-6-astra as backup) tied two files and also sent a message in the same answer, the gate rejected it twice and the client got no reply (call `75fa2974`). The mistake is built into the shape: OpenAI's reasoning models make one tool call per turn and get back only the word `recorded`, so nothing tells them that a tie changes what they may do next.

This change moves the planner to the pattern every provider is trained for: the model calls a tool, the system executes it and returns the real result, the model decides the next call, until it schedules the message. A tie returns its verification verdict as the tool result, so the reply is written with the verdict in hand, in the same run.

## What Changes

- **BREAKING (planner contract):** the planner run becomes a tool loop on every provider (Gemini, Anthropic, OpenAI): each turn's calls are judged, executed and answered with their real result text; the model continues until it ends the run.
- **BREAKING:** `conclude` is removed. The run ends on a terminal tool: `send_whatsapp_text`, `send_whatsapp_template`, `goal_complete` or `client_declined`. The decision label (`goal_complete` / `follow_up` / `collect` / `client_declined`) disappears from the model's answer; the trace step named `conclude` is written by code and says how the run ended.
- **BREAKING:** the "collect" answer and the follow-up planning cycle after a planner tie are removed. `tie_file`, `mark_collected` and an `add_instance` with files run the document check inside the tool call and return the verdict (approved / rejected with reasons / claimed / could not verify / refused). The after-verification cycle remains only for documents a website fetch delivered.
- A refused call no longer rejects the whole answer: the refusal text is the tool result and the model goes on. Only a run that ends without a terminal tool (a text-only turn) gets one corrective turn, then fails.
- The terminal tools carry a short `reasoning` parameter (stored on the draft and the trace, as the `conclude` reasoning was).
- The turn cap rises from 6 to 12 (a client sending several files needs one tie per turn on OpenAI).
- The LLM call record stores every turn's calls with their results; the call modal shows the result under each call and the number of turns.
- The planner prompt drops the four-decision section and describes the loop instead; the evals harness plays canned tool results and judges the run's ending.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `planner-answer-tools`: the answer is a loop with real tool results on every provider; `conclude` removed, `goal_complete` and `client_declined` added as terminal tools, `reasoning` on terminal tools; each call judged and executed on its own; a run ends with exactly one ending; the tie result is the verification verdict; turn cap 12; trace shows results. (This spec lives in the unarchived change `planner-tool-calls`; see tasks 1.1.)
- `verification-reply`: no collecting answer and no follow-up cycle for planner ties; the reply is written in the same run after the tie result; the fetch-delivery batch keeps its one cycle; busy indicators during a tie's verification.
- `conversation-trace`: tool steps are written per turn in execution order and record the result returned to the model; the `conclude` step is code-written and records how the run ended.
- `code-gates`: `validate_message` is recorded once per model turn with the checks `tool_calls`, `business_rules` (per call, refusals as failed entries) and, on the last turn, `ending`.
- `team-questions`: `ask_team` is accepted only before the message of the same run; the gate rules become per-call refusals.
- `client-decline`: `client_declined` is a terminal tool; a call after it, or a tie or message before it in the same run, is refused.

## Impact

- `src/agents/declarationOfCapital/`: `decisionTools.ts` (tool set, per-call parsing), `decisionSchema.ts` (per-call rules instead of whole-answer normalization), `decide.ts` (the loop driver), `plan.ts` (tool executors, run ending, `verifyThenReplan` removed), `toolStepDetails.ts`, `prompt.md` / `prompt.ts` (decision section, VERIFICATION RESULTS only for fetch batches), `verifyDocument.ts` (tie-time verification entry).
- `src/gemini/`: `toolTransport.ts` (real results, Anthropic `tool_result` and Gemini `functionResponse` turns, OpenAI `function_call_output` with text), `llmCall.ts` (executor callback, turn cap), `anthropic.ts`, `openai.ts`, `generate.ts` (multi-turn contents), `requestLog.ts` (turns with results), `llmStages.ts` (stage text).
- `web/src/`: call modal (results per call, turns), step summary for the code-written `conclude`, `#/llm-stages` text.
- `evals/`: planner stage runs the loop with canned results; `cases/planner.json` expectations move from `decision` to `ending` + `ties`.
- `docs/pipeline.md` section D, `docs/agents.md`; Notion "Agent Message Flow" animation and the Features page describing the collect cycle.
- Prerequisite: archive `planner-tool-calls` (its specs land in `openspec/specs/`) before this change is applied.
