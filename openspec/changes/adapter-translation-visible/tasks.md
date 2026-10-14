## 1. Translators report their changes

- [x] 1.1 Add the optional `SchemaChanges` collector to `anthropicSchema.ts · toAnthropicSchema` (paths of null removed, required dropped, keywords stripped, additionalProperties forced) and `filled` to `restoreOmittedNulls`; verify `tests/anthropicSchema.test.ts` still passes unchanged and a new test asserts the collected paths on the real injection, classification and extraction schemas (`holdings[].account_number`, `document_paper`, …). — `tests/wireRequest.test.ts`
- [x] 1.2 Pass a collector through `toolTransport.ts · toAnthropicTools` / `toOpenAiTools` so they report `tools_strict` and the forced `additionalProperties`; verify `tests/toolTransport.test.ts` passes and a new case pins the report for the planner tool set. — `tests/wireRequest.test.ts` ("the real planner tools need no change on either provider")

## 2. The sent copy

- [x] 2.1 Create `src/gemini/wireRequest.ts · sentRequestOf(provider, request)` per design D2 (null for Gemini); verify a unit test covers the three providers for a schema stage and a tool stage. — `translationOf` / `sentRequestOf`, tested in `tests/wireRequest.test.ts`
- [x] 2.2 Make `anthropic.ts` and `openai.ts` take their schema/tools from `sentRequestOf` (same translators, one source) and have the Anthropic adapter attach `restoredFields` to the returned response object; verify a test asserts the schema the adapter puts in `output_config` equals `sentRequestOf(...).responseJsonSchema` (mock the SDK client). — `tests/adapterWire.test.ts` (fetch stub for both providers; the tools keep `toAnthropicTools` / `toOpenAiTools`, which `sentRequestOf` calls too)
- [x] 2.3 Extend `requestLog.ts · requestForLog(request, provider)` with `sent` and update `generate.ts · recordCall`; verify a test shows `request.sent` present for Anthropic/OpenAI and absent for Gemini, and that binary parts are still never logged. — `requestForLog(request, sent)`: the caller passes the sent copy (no import cycle), tested in `tests/wireRequest.test.ts`

## 3. The trace steps

- [x] 3.1 Add `translate_request` and `restore_answer` to `AuditAction` and record them in `generate.ts · generateWithRetryDetailed` per design D4 (once per call, only with a client id and the DB sink); verify a test with a stubbed provider records exactly the two rows for Anthropic, one for OpenAI (no restore), none for Gemini and none for the file sink. — the decision table is the pure `wireRequest.ts · traceStepsOf` (tested in `tests/wireRequest.test.ts`); `generate.ts` records its two halves (`translateStepOf` before the call, `restoreStepOf` inside `recordCall` after the call row, so the trace reads translate → call → restore; checked on the local conversation endpoint: 18:37:15.512 → .553 → .572 UTC)
- [x] 3.2 Add the two steps to `docs/pipeline.md` (LLM call rows, functions `sentRequestOf` / `recordTranslationStep` / `recordRestoreStep`) and the redaction allow-list if `src/audit/redact.ts` needs the new detail keys; verify `npm test` passes. — section G of `docs/pipeline.md`; the redaction masks keys only (no new key matches), nothing to add

## 4. The admin UI

- [x] 4.1 `AdminLlmCalls.tsx`: schema and tools panes show the sent copy with the provider in the heading, the declared version collapsed when it differs, and the "not recorded" note for old rows (design D5); verify in the browser on a local Anthropic-style call row (insert a fixture row if no Anthropic key is available) and on an old row. — checked 2026-10-14 on a fixture injection-screen call (heading "כפי שנשלחה ל-Anthropic", omitted `temperature`, declared version collapsed below); an old OpenAI row has no `sent` (note shown); the fixture call row was deleted afterwards
- [x] 4.2 `i18n.tsx`: step labels and detail-key labels for the two steps (design D6); `StepDetailModal.tsx` renders list values as LTR comma-joined paths; verify the modal of a fixture `translate_request` row shows labelled rows and no raw-only JSON. — labels in `codeGateLabels`-style `stepActionLabels` + `stepFieldLabels`; `stepSummary.ts` mappings keep empty lists visible as a dash; both fixture step modals checked in the browser 2026-10-14. The two fixture audit rows (client b0db61c4, tagged `fixture: adapter-translation-visible`) stay in the local DB: audit_events is append-only
- [x] 4.3 Verify "copy details" of a call with `sent` pastes both the declared request and the sent copy (unit test on `callDetailsText`). — `tests/callLink.test.ts`

## 5. Verification

- [x] 5.1 `npm run typecheck` and `npm test` pass; `npm run evals` for the injection stage shows unchanged scores (the harness skips the audit steps). — 658 tests pass; web `tsc -p web --noEmit` clean; evals `injection_detection_llm` on gemini-3.1-pro-preview 16/16 (smoke file removed, latest.json/report.html restored)
- [ ] 5.2 Live check (owner, needs the Anthropic key): run the form intake on an Anthropic model, open the trace, confirm translate → call chip → restore → gate order and the sent schema in the call modal; record the step link in this file.
