## Why

The call log stores the answer schema (or tool set) as the code declares it, before the provider adapter changes it. For Anthropic the model receives a different schema: every "string or null" becomes an optional string, nullable fields leave the `required` list, size keywords are stripped and `temperature` is dropped; for OpenAI the tools gain `strict` and `additionalProperties:false`. When a check fails because of that difference (production, 2026-10-14, step `a59aac63`: the model wrote the text `"null"` into a field the sent schema no longer allowed to be null), the admin cannot see from the call modal what the model was actually asked for, and nothing in the conversation trace says that a translation happened or that nulls were put back afterwards.

## What Changes

- The call record stores, next to the declared request, what the adapter actually sent: the translated answer schema or tool set, the strict flag, and the request fields it left out. Gemini sends the request as declared and records nothing extra.
- The call detail modal's "forced answer schema" pane (and the tools pane for a tool-call stage) shows the schema **as sent to the provider**, says which provider received it, and keeps the declared version in a collapsed section when the two differ. "Copy details" includes both.
- Two new code steps appear in the conversation trace around every call that went through a provider adapter: a translation step before the call that lists what changed in the request (the fields that lost their null option and left `required`, the keywords stripped, the request fields omitted, the strict flag) and a restore step after the call that lists the nullable fields the adapter filled with null. Both open the existing step detail modal with labelled rows. A call whose adapter changed nothing (Gemini) records no step.
- Old call rows keep today's behaviour: the schema pane shows the declared schema and says the sent version was not recorded.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `conversation-trace`: the call detail modal shows the schema or tools as sent and the declared version on demand; two new code-step rows (request translation, answer restore) with their modal rendering; "copy details" carries the sent request.

## Impact

- `src/gemini/anthropicSchema.ts`, `src/gemini/toolTransport.ts`: the pure translators report what they changed (paths), without changing their output.
- `src/gemini/anthropic.ts`, `src/gemini/openai.ts`: the adapters expose the sent request and the restored field paths to the retry loop; no change to what goes over the wire.
- `src/gemini/generate.ts`, `src/gemini/requestLog.ts`: the call row gains `request.sent`; the retry loop records the two audit steps (new `AuditAction` values in `src/audit/audit.ts`).
- `web/src/components/admin/AdminLlmCalls.tsx`, `StepDetailModal.tsx`, `i18n.tsx`: the panes, the step labels and the detail renderer.
- `docs/pipeline.md`: the two steps listed with their functions. No migration: the new data lives in the existing `request` JSON column and in `audit_events.detail`.
