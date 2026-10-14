## 1. Prerequisites

- [ ] 1.1 Archive `whatsapp-only-decision-schema` with "Sync now" so `openspec/specs/planner-answer-schema/spec.md` exists; verify `openspec validate --change planner-tool-calls` passes against it

## 2. Tool definitions and assembly (pure code)

- [ ] 2.1 Create `src/agents/declarationOfCapital/decisionTools.ts`: the twelve tools as Zod scalar objects with name + description, `toolsForContext(ctx)` (intake / fetch / after-verification subsets), `toolJsonSchemas(ctx)` (`$refStrategy:'none'`, `$schema` removed, `additionalProperties:false`); verify `npm run typecheck`
- [ ] 2.2 Add `assembleDecision(calls, ctx)` in `decisionTools.ts` that returns today's `DecisionResponse` shape (evidence `''`/`''` → null, resolve+add_instance grouping, state_cost routing, attestation mapping) and throws named errors for the cardinality rules; verify with unit tests covering every scenario of the `planner-answer-tools` spec (`tests/decisionTools.test.ts`)
- [ ] 2.3 Replace `tests/decisionSchemaBudget.test.ts` with the shape test in `tests/decisionTools.test.ts`: for the four contexts every tool has zero nullable, zero optional, no object / list-of-objects parameter, at most 20 tools; verify `npm test` passes and the test fails when a nested parameter is added in a scratch copy
- [ ] 2.4 Rewire `gateDecision(calls, ctx)` to run `tool_calls` (offered tool, Zod parse per call, exactly one `conclude`, `observed` = count + names) then `assembleDecision` + `normalizeDecision` as `business_rules`; update `DecisionRejectedError` callers and `correctionSuffix(calls, err)`; verify `tests/intakeDecision.test.ts`, `collectDecision.test.ts`, `decisionKeepalive.test.ts` pass after converting their inputs with a `callsOf(raw)` helper
- [ ] 2.5 Remove `DecisionResponseSchema` pruning, `restorePrunedNulls`, `decisionSchemaForContext`, `decisionSchemaKey` and `decisionJsonSchemaForContext` where no longer used (keep the `DecisionResponse` type); verify `npm run typecheck` and grep shows no caller

## 3. LLM transport: tools on every provider

- [ ] 3.1 Extend `LlmCallSpec` (`tools` + `toolChoice`, `responseJsonSchema` optional, exactly one set) and `LlmCallResult.toolCalls`; `runLlmCall` builds the Gemini request with `tools`/`toolConfig` (mode ANY, allowed names) and no `responseMimeType`/`responseJsonSchema` for a tool call; verify `npm run typecheck` and a unit test that the request shape is right for both variants
- [ ] 3.2 Anthropic adapter: translate tools to strict `tools` + `tool_choice: any`, read `tool_use` blocks into `functionCalls`; keep the schema path; verify pure translation tests in `tests/anthropicSchema.test.ts` (tool list, parsed calls from a fixture response)
- [ ] 3.3 OpenAI adapter: translate tools to strict `function` tools + `tool_choice: 'required'` + `parallel_tool_calls: true`, read `function_call` items (parse `arguments`); verify a translation test with a fixture response
- [ ] 3.4 Logging: `requestForLog` records `config.tools`/`toolConfig`; `recordCall` stores the calls as JSON text when the response has calls; verify a unit test on `requestForLog` and one on the stored response text

## 4. Planner call and prompt

- [ ] 4.1 `buildDecisionCall` returns the tool spec for the context; `decide()` passes `result.toolCalls` to the gate and quotes them in the retry; verify `npm run typecheck` and the decision tests
- [ ] 4.2 Rewrite `prompt.md` actions 1–4 and the message section for tool calls (same rules, tool names instead of field names, "do not call" instead of "leave null"); verify the prompt fixture test (if any) and a read-through that no `whatsapp_text`/`attestation:` field name remains in the prompt
- [ ] 4.3 `llmStages.ts`: the `generate_message` entry lists the tools (name, description, parameters) instead of one schema; verify the `#/llm-stages` API returns them (`GET /api/admin/llm-stages`)

## 5. Admin UI

- [ ] 5.1 `AdminLlmCalls.tsx`: when `request.config.tools` exists render the tool list (reusing the schema rows), and render a response that is a JSON array of `{name, args}` as one card per call; old rows unchanged; verify `npm run build:gui` and a browser check on a local planner call
- [ ] 5.2 `AdminLlmStages.tsx`: render a stage's tool list (one block per tool) when the stage has `tools`; verify a browser check of `#/llm-stages`

## 6. Evals and live checks

- [ ] 6.1 `evals/stages.ts`: `generate_message.build` returns the tool spec and `parse(result)` assembles the calls; adapt the harness so `parse` receives the call result (other stages read `result.text`); verify `npm run evals -- --stage generate_message --models <gemini model>` runs and `judge` is untouched
- [ ] 6.2 Run the planner evals on all three providers (`--models` with the Gemini, Claude and OpenAI models configured in `LLM_MODEL_OPTIONS`) and record the gate-acceptance rate next to `latest.json`; verify no case fails on `tool_calls` more than once (the retry) and note any provider that emits one call per turn
- [ ] 6.3 Live acceptance probe: send the real tool set for a capital-declaration client without a fetch offer to `claude-opus-5` once and record "accepted" in this file; verify no "grammar too large" and the answer is tool calls
- [ ] 6.4 Local end-to-end: one planner cycle for a test client on each provider (Gemini locally, Claude, OpenAI if a key exists) and check the trace shows `validate_message` with `tool_calls` + `business_rules` and the call modal shows tools and calls; verify in the browser

## 7. Docs and close

- [ ] 7.1 Update `docs/pipeline.md` (generate_message → tool calls → `assembleDecision` → `normalizeDecision`) and `docs/agents.md` where the answer form is described; verify a read-through
- [ ] 7.2 Notion: update the "Schemas" and "Anthropic constraints" research pages (the planner now answers with tools; link "The Heavy Form") following `STYLE.md`; verify by fetch
- [ ] 7.3 Commit per the git workflow, deploy, set the production `generate_message` model back to Claude in `#/llm-stages`, confirm one live planner call in the production trace; then `/opsx:archive planner-tool-calls`
