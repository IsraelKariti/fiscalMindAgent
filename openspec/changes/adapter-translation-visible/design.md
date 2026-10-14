## Context

See proposal.md for why. Today:

- `generate.ts · generateWithRetryDetailed` picks the provider and calls the Gemini SDK, `anthropic.ts · generateContentAnthropic` or `openai.ts · generateContentOpenAI`. It logs the call with `requestLog.ts · requestForLog(request)`, which copies `config.responseJsonSchema` / `config.tools` as declared.
- The Anthropic adapter translates inside its own function: `anthropicSchema.ts · toAnthropicSchema` (null unions collapsed, nullable fields dropped from `required`, 12 keywords stripped, `additionalProperties:false` forced) on the way out, `restoreOmittedNulls` on the way back. It never forwards `temperature`. The tool path is `toolTransport.ts · toAnthropicTools` (`strict: true`, same keyword stripping).
- The OpenAI adapter sends the schema unchanged (`strict: true` since ec8edd0) and never forwards `temperature`; its tools get `additionalProperties:false` + `strict: true` (`toOpenAiTools`).
- The trace shows `audit_events` rows with a `clientId` as code steps (`Timeline.tsx · StepRow`, `StepDetailModal.tsx`), with labels in `i18n.tsx · codeGateLabels` and generic key/value rows for detail fields the renderer does not know.
- `LlmCallLogContext` (the `log` argument of the retry loop) carries `userId`, `agentInstanceId`, `clientId`, `purpose`, and a file sink for the evals harness.

## Goals / Non-Goals

**Goals:**
- One place computes "what the adapter sent" from the same pure translators the adapters use, so the log can never drift from the wire.
- The two trace steps are recorded by the retry loop, not by the adapters, so adapters stay free of audit/DB imports.
- No migration, no new endpoint, no change to what goes over the wire.

**Non-Goals:**
- Changing the translation itself (adding "none" to enums, converting the text `"null"` back to null). That is a separate change.
- Showing per-provider schemas on `#/llm-stages`.
- Recording a step for Gemini calls (nothing is translated).
- Storing the raw (pre-restore) answer text; the restore step lists the filled paths instead.

## Decisions

**D1. The translators report their changes through an optional collector.**
`toAnthropicSchema(schema, changes?)` and `restoreOmittedNulls(schema, value, filled?)` take an optional mutable collector (`SchemaChanges` = `{ nullRemoved: string[]; requiredDropped: string[]; keywordsStripped: {path, keyword}[]; additionalPropertiesForced: string[] }`, `filled: string[]`) and push JSON paths (`holdings[].account_number`) as they walk. Output is byte-identical with or without the collector, pinned by the existing tests. Alternative: a separate diff of declared vs sent schemas; rejected because a diff cannot tell "null removed" from "keyword stripped" reliably and would duplicate the walk.

**D2. A pure `wireRequest.ts · sentRequestOf(provider, request)` builds the sent copy.**
Returns `null` for Gemini; for Anthropic `{ provider, responseJsonSchema | tools, strict, omitted: ['temperature'], changes }`; for OpenAI `{ provider, responseJsonSchema (unchanged) | tools (strict), strict: true, omitted: ['temperature'], changes }` where `changes` lists only the tool strict/additionalProperties facts. The adapters call the same translators; the module is the single source of truth for the log, and the adapters are asserted (test) to send exactly `sentRequestOf(...)`'s schema/tools.

**D3. The sent copy lives in `llm_calls.request.sent`.**
`requestForLog(request, provider)` adds `sent` from D2. No migration; old rows simply lack the key, which the modal reads as "not recorded". Alternative: a new column; rejected as unnecessary for a JSON blob that is read only by the modal and copy-details.

**D4. The two steps are audit rows written by the retry loop.**
New `AuditAction` values `translate_request` and `restore_answer`. In `generateWithRetryDetailed`, right before the provider call: when `sentRequestOf` is not null and `log.clientId` is set and the sink is the DB, `recordAudit({ action: 'translate_request', actorType: 'system', clientId, agentInstanceId, severity: 'info', detail: { provider, purpose, model, schema_changed: boolean, null_removed, required_dropped, keywords_stripped, omitted, tools_strict } })`. After a successful Anthropic call whose response carries `restoredFields` (the adapter attaches it as an extra property on the Gemini-shaped response object, like `functionCalls`): `recordAudit({ action: 'restore_answer', ..., detail: { provider, purpose, filled: string[] } })`. Recorded once per call, not per retry attempt (the translation is identical on every attempt). Ordering in the trace follows timestamps: translate → call chip → restore → gate.

**D5. The modal prefers `request.sent`.**
`AdminLlmCalls.tsx`: `schemaSent = call.request.sent?.responseJsonSchema`, `toolsSent = declaredToolsOf(call.request.sent?.tools)`; the pane heading becomes "Forced answer schema · as sent to Anthropic"; when `JSON.stringify(sent) !== JSON.stringify(declared)` a nested `<details>` "as declared in the code" shows the declared one. No `sent`: declared pane + muted note "sent version not recorded". `callDetailsText` already serialises the whole `request`, so `sent` lands in the copied text with no extra work; a test pins it.

**D6. Step rendering reuses the labelled-row renderer.**
`codeGateLabels` gains `translate_request: 'Translate Request'` and `restore_answer: 'Restore Answer'`; `gateDetailLabels` (the Hebrew labels of detail keys) gains the new keys (`null_removed`, `required_dropped`, `keywords_stripped`, `omitted`, `tools_strict`, `schema_changed`, `filled`). List values render as comma-joined paths in LTR. No new modal section.

## Risks / Trade-offs

- [Trace gets two more rows per Anthropic/OpenAI call] → Both sit under the code-steps toggle, which is admin-only and off for accountants; the gate row already sits there. Gemini (the default model) adds nothing.
- [Audit rows written from the retry loop could fail or slow the call] → `recordAudit` is fire-and-forget by design; a failure logs and never throws.
- [The evals harness writes calls to a file sink and has no client] → Steps are skipped when `log.clientId` is null or the sink is not the DB, mirroring today's `recordCall` branch.
- [Collector adds a parameter to two pure functions used by tests] → Optional parameter; existing tests unchanged, new tests assert the collected paths on the real stage schemas.
- [`request.sent` doubles the stored schema size for the questionnaire stage (3 KB)] → Negligible against the prompt text already stored.

## Migration Plan

Deploy as a normal push (sandbox auto-deploys, prod by promotion). No migration. Rollback is a revert; old and new rows coexist (the modal handles a missing `sent`).
