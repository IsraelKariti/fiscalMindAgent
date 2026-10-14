## Why

Since the 12 Oct 2026 deploy every planner call on a Claude model fails with HTTP 400 "The compiled grammar is too large": the planner's single answer form nests a stated-cost sub-form inside each new item of two lists, and Anthropic compiles the whole form into one grammar whose size grows with nesting depth. Measured on 14 Oct 2026, removing every nullable field (sentinels) does not help; only removing nested parts does. The form has grown for a year and will grow again, so a structural fix is needed: the planner answers with several small, flat tool calls instead of one deep form.

## What Changes

- **BREAKING (internal)**: the `generate_message` stage no longer asks for one JSON object. The model is given a set of tools, each with a flat parameter list, and must answer with one or more tool calls in a single turn (forced tool choice, parallel calls). The code assembles the calls into the same normalized decision the rest of the pipeline already consumes; the business rules (evidence quotes, instance caps, message rules, attestation gate) do not change.
- One tool per planner action: `conclude` (decision + reasoning, exactly once), `send_whatsapp_text`, `send_whatsapp_template`, `mark_collected`, `tie_file`, `resolve_document`, `add_instance`, `state_cost`, `retire_document`, `attestation` (action request / confirmed), `tax_fetch`. Every parameter is required; "none" is an empty value (`''`, `[]`, `0`); no parameter is nullable and no parameter object nests deeper than one level.
- The set of tools offered per call replaces today's field-group pruning: no intake → no checklist tools; no fetch provider → no `tax_fetch`; the after-verification cycle → no `mark_collected`/`tie_file` and no `collect` value.
- The three vendor adapters (Gemini, Anthropic, OpenAI) learn to send tool definitions, force a tool answer, and return the list of calls. Anthropic tools are sent strict; OpenAI tools are sent strict (all parameters required, no extra keys), replacing today's `strict:false` for this stage.
- The `validate_message` gate's first check becomes `tool_calls` (every call names an offered tool and its parameters match that tool's schema; exactly one `conclude`), followed by the unchanged `business_rules` check.
- The planner prompt describes the tools instead of the JSON fields; the correction retry quotes the rejected calls.
- LLM call logging, the admin call modal and the `#/llm-stages` page show the tool list in the request and the tool calls in the response.
- The evals harness builds the same tool request and judges the assembled decision with the same code gate.
- The nullable-place budget test is replaced by a per-tool shape test (zero nullable, zero optional, depth ≤ 1) and the live acceptance check of the real tool set on `claude-opus-5`.
- The `attestation` null problem disappears: a missing `attestation` call simply means "no attestation action".
- Stated cost of a new instance stays in the same answer (`state_cost` naming the instance) — the 12 Oct behaviour is kept without the nested sub-form.

## Capabilities

### New Capabilities
- `planner-answer-tools`: how the conversation planner answers — the tool set, the one-turn multi-call contract, which tools are offered per call, how calls are assembled into one decision, and the shape limits every tool keeps so that every model provider accepts the request.

### Modified Capabilities
- `planner-answer-schema`: its three requirements (one WhatsApp message and no channel choice; request schema lists only usable groups; the 15-place nullable budget) are superseded: the first is restated for tool calls in `planner-answer-tools`, the other two are removed because there is no single request schema any more. The change `whatsapp-only-decision-schema` that introduces this spec MUST be archived before this change, so the base spec exists when this delta is applied.
- `code-gates`: the `validate_message` entry of "Checks reported by each existing gate": the first check is `tool_calls` instead of `json_schema`, with its own `observed` text (the number and names of the calls).

## Impact

- `src/agents/declarationOfCapital/decisionSchema.ts`, `decide.ts`: tool definitions and the assembler replace the Zod answer form, pruning and `restorePrunedNulls`; `normalizeDecision` and the `NormalizedDecision` type stay.
- `src/gemini/llmCall.ts`, `generate.ts`, `requestLog.ts`, `anthropic.ts`, `anthropicSchema.ts`, `openai.ts`: a tool-call request/response path beside the JSON-schema path (the other stages keep their forms).
- `src/agents/declarationOfCapital/prompt.md` (actions 1–4 and the message section), `plan.ts` (unchanged call site), `llmStages.ts` (stage listing).
- `web/src/components/admin/AdminLlmCalls.tsx`, `AdminLlmStages.tsx`: render tools and tool calls.
- `evals/stages.ts` (`generate_message` adapter), fixtures under `evals/data/generate_message`.
- Tests: `tests/decisionSchemaBudget.test.ts` (replaced), `tests/anthropicSchema.test.ts`, `tests/intakeDecision.test.ts`, `tests/collectDecision.test.ts`, `tests/decisionKeepalive.test.ts` (feed tool calls instead of JSON text), new adapter translation tests.
- Production: restores the Claude planner (broken since 2026-10-12 16:12 UTC). No database migration. The `llm_calls.response` column stores the calls as JSON text; old rows keep their JSON object text.
- Dependency order: archive `whatsapp-only-decision-schema` first (its open task 3.3 is the planner evals, which this change re-runs anyway).
