## 1. Prerequisites

- [x] 1.1 Archive `whatsapp-only-decision-schema` with "Sync now" so `openspec/specs/planner-answer-schema/spec.md` exists; verify `openspec validate --change planner-tool-calls` passes against it

## 2. Tool definitions and assembly (pure code)

- [x] 2.1 Create `src/agents/declarationOfCapital/decisionTools.ts`: the eleven tools as Zod scalar objects with name + description (`attestation` is one tool with an `action`, see design), `toolsForContext(ctx)` (intake / fetch / after-verification subsets), `toolJsonSchemas(ctx)` (`$refStrategy:'none'`, `$schema` removed, `additionalProperties:false`); verify `npm run typecheck`
- [x] 2.2 Add `assembleDecision(calls, ctx)` in `decisionTools.ts` that returns today's `DecisionResponse` shape (evidence `''`/`''` → null, resolve+add_instance grouping, state_cost routing, attestation mapping) and throws named errors for the cardinality rules; verify with unit tests covering every scenario of the `planner-answer-tools` spec (`tests/decisionTools.test.ts`)
- [x] 2.3 Replace `tests/decisionSchemaBudget.test.ts` with the shape test in `tests/decisionTools.test.ts`: for the four contexts every tool has zero nullable, zero optional, no object / list-of-objects parameter, at most 20 tools; verify `npm test` passes and the test fails when a nested parameter is added in a scratch copy
- [x] 2.4 Rewire `gateDecision(calls, ctx)` to run `tool_calls` (offered tool, Zod parse per call, exactly one `conclude`, `observed` = count + names) then `assembleDecision` + `normalizeDecision` as `business_rules`; update `DecisionRejectedError` callers and `correctionSuffix(calls, err)`; verify `tests/intakeDecision.test.ts`, `collectDecision.test.ts`, `decisionKeepalive.test.ts` pass after converting their inputs with a `callsOf(raw)` helper
- [x] 2.5 Remove `DecisionResponseSchema` pruning, `restorePrunedNulls`, `decisionSchemaForContext`, `decisionSchemaKey` and `decisionJsonSchemaForContext` where no longer used (keep the `DecisionResponse` type); verify `npm run typecheck` and grep shows no caller

## 3. LLM transport: tools on every provider

- [x] 3.1 Extend `LlmCallSpec` (`tools` + `toolChoice`, `responseJsonSchema` optional, exactly one set) and `LlmCallResult.toolCalls`; `runLlmCall` builds the Gemini request with `tools`/`toolConfig` (mode ANY, allowed names) and no `responseMimeType`/`responseJsonSchema` for a tool call; verify `npm run typecheck` and a unit test that the request shape is right for both variants
- [x] 3.2 Anthropic adapter: translate tools to strict `tools` + `tool_choice: any`, read `tool_use` blocks into `functionCalls`; keep the schema path; verify pure translation tests (`tests/toolTransport.test.ts`: tool list, parsed calls from a fixture response)
- [x] 3.3 OpenAI adapter: translate tools to strict `function` tools + `tool_choice: 'required'` + `parallel_tool_calls: true`, read `function_call` items (parse `arguments`); verify a translation test with a fixture response
- [x] 3.4 Logging: `requestForLog` records `config.tools`/`toolConfig`; `recordCall` stores the calls as JSON text when the response has calls; verify a unit test on `requestForLog` and one on the stored response text
- [x] 3.5 OpenAI continuation (design decision 10): `LlmCallSpec.finalTool` → `request.continuation`; `runOpenAiToolTurns` in `toolTransport.ts` feeds every call back as `recorded` against `previous_response_id` until `conclude`, a turn without calls, or 6 turns, returning the calls of all turns and the summed usage; the planner sets `finalTool: 'conclude'`; verify unit tests (stop on conclude, three-turn chain with the exact second request, cap, no rule) and one evals run on `gpt-6-astra`

## 4. Planner call and prompt

- [x] 4.1 `buildDecisionCall` returns the tool spec for the context; `decide()` passes `result.toolCalls` to the gate and quotes them in the retry; verify `npm run typecheck` and the decision tests
- [x] 4.2 Rewrite `prompt.md` actions 1–4 and the message section for tool calls (same rules, tool names instead of field names, "do not call" instead of "leave null"); verify the prompt fixture test (if any) and a read-through that no `whatsapp_text`/`attestation:` field name remains in the prompt
- [x] 4.3 `llmStages.ts`: the `generate_message` entry lists the tools (name, description, parameters) instead of one schema; verify the `#/llm-stages` API returns them (`GET /api/admin/llm-stages`)

## 5. Admin UI

- [ ] 5.1 `AdminLlmCalls.tsx`: when `request.config.tools` exists render the tool list (reusing the schema rows), and render a response that is a JSON array of `{name, args}` as one card per call; old rows unchanged; verify `npm run build:gui` and a browser check on a local planner call
- [ ] 5.2 `AdminLlmStages.tsx`: render a stage's tool list (one block per tool) when the stage has `tools`; verify a browser check of `#/llm-stages`

## 6. Evals and live checks

- [x] 6.1 `evals/stages.ts`: `generate_message.build` returns the tool spec and `parse(result)` assembles the calls; adapt the harness so `parse` receives the call result (other stages read `result.text`); verify `npm run evals -- --stage generate_message --models <gemini model>` runs and `judge` is untouched
- [x] 6.2 Run the planner evals on all three providers (`--models` with the Gemini, Claude and OpenAI models configured in `LLM_MODEL_OPTIONS`) and record the gate-acceptance rate next to `latest.json`; verify no case fails on `tool_calls` more than once (the retry) and note any provider that emits one call per turn
  Run of 2026-10-14 (31 planner cases, results in the session scratch folder, `latest.json` untouched): `gemini-3.1-pro-preview` 27/31 (1 shape fault: no `conclude` call, 1 provider 504, 2 content checks); `claude-opus-5` 28/31 (1 shape fault: no `conclude`, 2 content checks); `gpt-6-astra` 0/31 — the OpenAI Responses API returned exactly ONE function call per turn in every case (`tool_choice: required`, `parallel_tool_calls: true`), so `conclude` was never present. Owner chose the continuation (design decision 10, task 3.5); re-run of 7 cases on `gpt-6-astra` with the loop, 2026-10-14: 6/7 pass, every answer reached `conclude` (2 to 4 turns, about 35k input tokens per case against a 23k prompt, a third of them cache reads, about $0.31 per case); the one failure is a business rule (file tied in a `follow_up`), which the production retry covers.
- [x] 6.3 Live acceptance probe: send the real tool set for a capital-declaration client without a fetch offer to `claude-opus-5` once and record "accepted" in this file; verify no "grammar too large" and the answer is tool calls
  Accepted 2026-10-14: 31 planner calls on `claude-opus-5` with the eleven strict tools, every one answered with tool calls, no HTTP 400.
- [ ] 6.4 Local end-to-end: one planner cycle for a test client on each provider (Gemini locally, Claude, OpenAI if a key exists) and check the trace shows `validate_message` with `tool_calls` + `business_rules` and the call modal shows tools and calls; verify in the browser

## 7. Docs and close

- [x] 7.1 Update `docs/pipeline.md` (generate_message → tool calls → `assembleDecision` → `normalizeDecision`) and `docs/agents.md` where the answer form is described; verify a read-through
- [x] 7.2 Notion: update the "Schemas" and "Anthropic constraints" research pages (the planner now answers with tools; link "The Heavy Form") following `STYLE.md`; verify by fetch
- [ ] 7.3 Commit per the git workflow, deploy, set the production `generate_message` model back to Claude in `#/llm-stages`, confirm one live planner call in the production trace; then `/opsx:archive planner-tool-calls`
