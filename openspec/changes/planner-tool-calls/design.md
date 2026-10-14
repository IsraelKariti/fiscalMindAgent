## Context

See proposal.md — Why. Today `decide.ts` builds one Zod answer form per context (`decisionSchemaForContext`, pruning + `restorePrunedNulls`), sends it as `responseJsonSchema` through `runLlmCall`, and `gateDecision` parses the text, then `normalizeDecision` applies the business rules and returns a `NormalizedDecision` that `plan.ts` and everything after it consume. The three vendor adapters (`src/gemini/client.ts` native, `anthropic.ts`, `openai.ts`) translate a Gemini-shaped request; none of them sends tools today. Anthropic compiles the response schema into one grammar; measured on 2026-10-14 (nine variants on `claude-opus-5`), the stated-cost sub-form nested four levels deep in two lists is the only part whose removal makes the form compile, and removing all nullable fields does not help.

Constraints:
- `normalizeDecision`, `NormalizedDecision`, `plan.ts`, the apply steps, the trace and the evals judge must keep working unchanged; they are the bulk of the planner.
- Anthropic documented limits per request: 20 strict tools, 24 optional parameters, 16 union-typed parameters, plus the grammar size; tools are compiled one grammar each. OpenAI strict mode needs every key in `required` and `additionalProperties:false`. Gemini accepts function declarations with `mode: ANY`.
- The change `whatsapp-only-decision-schema` (spec `planner-answer-schema`, not yet archived) is the base the deltas modify.

## Goals / Non-Goals

**Goals:**
- Every tool parameter schema is flat (depth ≤ 1 under the parameters object), fully required, never nullable, so all three providers accept it with strict mode on.
- One model turn, several parallel calls; no tool-result round trip.
- The assembled decision is byte-identical in shape to today's `DecisionResponse`, so `normalizeDecision` stays the single business-rule authority.
- The behaviour of 2026-10-12 (a stated cost on a new item in the same answer) is kept.

**Non-Goals:**
- Converting the other stages (classifier, extraction, injection screen, form intake) to tools: their forms are flat and accepted.
- An agentic loop with tool results, memory or multiple turns.
- Changing any business rule, message wording, or timing rule.
- A database migration (the `llm_calls` columns are text/JSON already).

## Decisions

1. **Tool calls are assembled into today's `DecisionResponse`, then normalized as before.**
   A pure `assembleDecision(calls, ctx)` turns the call list into the raw form object (`decision`, `reasoning`, `whatsapp_text`, `whatsapp_template`, `send_at`, `collected_document_ids`, `matched_files`, `resolved_documents`, `added_instances`, `retired_documents`, `stated_costs`, `attestation`, `attestation_evidence`, `tax_fetch_*`). `gateDecision` then runs `normalizeDecision` on it exactly as today. Alternative considered: rewriting the validators to read calls directly — rejected, it would touch ~700 lines of rules for no behavioural gain.
   Assembly rules: evidence pair `('', '')` → `evidence: null`; `add_instance` whose anchor is a `resolve_document(required)` of the same answer → that resolution's `instances`; otherwise ONE `added_instances` entry per anchor holding every `add_instance` of that anchor (the validator rejects two entries on one anchor; the entry's evidence / `proven_by_file_id` come from the first call that gives one); `state_cost` with `document_id` → `stated_costs[]`, with `instance_name` → the matching instance's `stated_cost` (amount `0` form otherwise; an unmatched name is an assembly error); `attestation(action)` → `attestation: 'request' | 'confirmed'` + evidence; no attestation call → `null`. The attestation gate is ONE tool with an `action` parameter rather than two tools, because a tool with no parameters at all is not accepted by every provider's function-declaration shape.

2. **Tool definitions are Zod objects of scalars and scalar lists, one file `decisionTools.ts`.**
   Each tool: `name`, `description` (Hebrew/English one-liner the model reads), `params` (Zod object). `toolsForContext(ctx)` returns the offered subset (same conditions as today's pruning plus the after-verification rule). JSON schemas come from `zodToJsonSchema` with `$refStrategy: 'none'`, `$schema` removed, `additionalProperties:false` on the parameters object. Alternative: hand-written JSON schemas — rejected, Zod gives the parser for free and the shape test runs on the same objects.

3. **`LlmCallSpec` gains a tool variant; `LlmCallResult` gains `toolCalls`.**
   `responseJsonSchema` becomes optional and a new field `tools?: { name; description; parameters }[]` plus `toolChoice: 'required'` is added; exactly one of the two must be set. `runLlmCall` returns `toolCalls: { name: string; args: unknown }[]` (empty for schema calls). Per provider:
   - Gemini: `config.tools = [{ functionDeclarations }]`, `config.toolConfig.functionCallingConfig.mode = 'ANY'` (with `allowedFunctionNames`), read `response.functionCalls`. No `responseMimeType`/`responseJsonSchema` on a tool call (Gemini rejects both together).
   - Anthropic: `tools: [{ name, description, input_schema, strict: true }]`, `tool_choice: { type: 'any' }` (parallel allowed), read `tool_use` blocks. `toAnthropicSchema` is still applied for keyword stripping; with no nullable places it changes nothing else.
   - OpenAI Responses: `tools: [{ type: 'function', name, description, parameters, strict: true }]`, `tool_choice: 'required'`, `parallel_tool_calls: true`, read `function_call` output items (`arguments` is a JSON string).
   The Gemini-shaped `GenerateContentResponse` already carries `functionCalls`; the two translation layers fill it so `generate.ts` stays provider-agnostic. Alternative: a new transport type per provider — rejected, the existing shape has the field.

4. **Logging stores the tool list in the request and the calls as the response text.**
   `requestForLog` adds `config.tools` (and `toolConfig`); `recordCall` stores `JSON.stringify(functionCalls)` when the response has calls and no text. The admin modal detects `request.config.tools` and renders a tool list (name, description, parameter rows reusing `SchemaBlock`), and parses the response as a call list when it is a JSON array of `{name, args}`. Old rows keep today's rendering.

5. **The gate's first check is renamed `tool_calls`.** It covers: at least one call; every call names an offered tool; each `args` parses with that tool's Zod schema; exactly one `conclude`. `observed` = `"<n> calls: name, name, …"`. The assembly cardinality rules (one `send_*`, one `attestation`, one `tax_fetch`, `state_cost` target, a follow_up without a message) are `business_rules` failures (they are rules about the decision, not about the shape). Alternative: keep the name `json_schema` — rejected, the trace would lie about what was checked. `gateDecision` and `correctionSuffix` move to `decisionTools.ts` (which imports `decisionSchema.ts`, never the reverse — no module cycle); `DecisionRejectedError` and `normalizeDecision` stay where they are.

6. **Corrective retry.** `correctionSuffix` quotes `JSON.stringify(calls)` and the note, and restates the tool rules (one `conclude`; `follow_up` needs exactly one `send_*`; `collect` ties a file and has no `send_*`). The retry request keeps the same tool set and forced choice.

7. **Prompt.** `prompt.md` actions 1–4 and the message section are rewritten in terms of tool calls (same rules, same Hebrew wording of the behaviour; field names replaced by tool names; "leave null" becomes "do not call"). The system instruction keeps describing WHEN to use each tool; the tool `description` strings hold the one-line WHAT.

8. **Evals.** The `generate_message` adapter's `build` returns the tool spec and `parse: (result) => assembleDecision(result.toolCalls, ctx)`; `judge` is unchanged (it reads the raw `DecisionResponse` and calls `normalizeDecision`). The harness's `runLlmCall` path returns `toolCalls`, so `parse` receives the result object instead of text — a small harness-wide type change (`parse(result)` with `result.text` for the other stages).

9. **Tests.** `tests/decisionSchemaBudget.test.ts` → `tests/decisionTools.test.ts`: for each context (full, no fetch, after verification, no intake) every tool has zero nullable, zero optional, no object/array-of-object parameter, ≤ 20 tools; plus assembly unit tests (the scenarios of the spec). Adapter tests: pure translation functions `toAnthropicTools`, `toOpenAiTools`, `toGeminiTools` and `callsFromAnthropic`/`callsFromOpenAi`/`callsFromGemini` on fixture responses. Existing decision tests build their input as call lists through a small helper `callsOf(raw)` that turns a legacy raw object into calls, so their cases stay readable.

## Risks / Trade-offs

- [The model splits one message across two `send_*` calls or forgets `conclude`] → the gate rejects with a named note and one corrective retry; evals measure the rate before the switch.
- [Parallel-call reliability differs per provider (a model may emit calls one per turn)] → `tool_choice` forced + prompt rule "all calls in one answer"; the evals run on all three providers before archive. If a provider emits a single call per turn in practice, the fallback is a second forced turn without tool results — recorded as an open question, not built now.
- [Anthropic per-request limits: 20 strict tools] → 12 tools today; the shape test asserts ≤ 20 and zero optional/union parameters so the 24/16 budgets are never touched.
- [`llm_calls.response` holds a JSON array now] → the modal branches on shape; the usage/pricing code reads only `usageMetadata`.
- [Hebrew `instance_name` matching between `add_instance` and `state_cost`] → exact string match after trim; a mismatch is a rejection with the name quoted, so the retry fixes it.
- [Old evals fixtures expect JSON answers] → `judge` keeps reading the raw form; only `build/parse` change.

## Migration Plan

1. Archive `whatsapp-only-decision-schema` (sync its deltas) so `planner-answer-schema` exists.
2. Build behind no flag: the stage switches in one commit; the other stages are untouched.
3. Run `npm run evals -- --stage generate_message --models <gemini>,<claude>,<gpt>` and compare the gate-acceptance rate with `latest.json`.
4. Live probe of the tool set on `claude-opus-5` (one call) before archiving.
5. Deploy; in production, set the `generate_message` model back to Claude in `#/llm-stages` once the first live call shows in the trace.
Rollback: revert the commit; no data migration to undo (old rows render as before).

## Open Questions

- ANSWERED 2026-10-14 by the evals run: Anthropic (`claude-opus-5`) and Gemini (`gemini-3.1-pro-preview`) make all calls in one turn (28/31 and 27/31 cases accepted; one case each forgot `conclude`, which the production retry covers). OpenAI (`gpt-6-astra`, Responses API with `tool_choice: 'required'` and `parallel_tool_calls: true`) returned exactly one function call per turn in all 31 cases, so no OpenAI answer ever carried `conclude`.
- OPEN, owner's decision: how to treat OpenAI for the planner. (1) Not offered for `generate_message`: the stage refuses an OpenAI model with a clear error and the admin picker hides OpenAI for this stage; the spec's "every provider" sentence is narrowed to Gemini and Anthropic. (2) Build a bounded continuation for OpenAI only: after each turn, feed the calls back as `function_call_output: "recorded"` and ask for the remaining calls until `conclude` arrives (cap 6 turns); each extra turn re-sends the ~23k-token prompt (OpenAI prompt caching lowers the cost), so one planner run would cost several times a Claude run.
