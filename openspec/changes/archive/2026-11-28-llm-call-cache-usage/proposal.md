## Why

Anthropic calls never used the prompt cache: three planner calls three minutes apart (2026-11-28, `claude-opus-5`, 52K–106K input tokens each) all recorded 0 cached tokens, because Anthropic caches only when the request asks for it. Turning the cache on adds a fourth price category that the call log cannot show today — tokens written into the cache, billed above the input rate — and the admin has no way to see the provider's own token report or to choose how long the cache lives.

## What Changes

- Anthropic requests ask for prompt caching of their fixed start (tool definitions + system instructions). The first edit for this is already in the working tree (`src/gemini/anthropic.ts`, uncommitted); this change completes it.
- A new admin setting chooses the Anthropic cache lifetime: 5 minutes (default) or 1 hour. One platform-wide value, in the admin settings "language model" section.
- Every LLM call row stores the provider's raw usage block(s), exactly as the provider returned them, and the call page shows them as a raw JSON section.
- Every LLM call row stores cache-write tokens in their own field, with their own price, and the total cost includes them at the cache-write rate (today they are folded into plain input, so the cost is too low).
- The call page gets a fifth token tile, "cache-write tokens", next to input / output / thinking / cached, with its price per million tokens.
- The call page shows which cache lifetime the call asked for (5 minutes or 1 hour), taken from the call itself, not from the current setting.
- The admin usage page (`#/usage`) and the per-accountant usage totals count cache-write tokens too: the daily totals store them per lifetime, the cost prices them at the cache-write rate, and the usage table shows a cache-write column.

Assumptions recorded here (minor, not asked):
- The lifetime setting is one value for all stages, not per stage.
- There is no "caching off" option.
- Providers with no cache-write charge (OpenAI, Gemini) show 0 cache-write tokens and no lifetime.

## Capabilities

### New Capabilities
- `llm-call-cache-usage`: what an LLM call records and shows about token usage and prompt caching — the raw provider usage, cache-write tokens and their price, the cache lifetime the call asked for, the cost rule, and the Anthropic cache request itself.

### Modified Capabilities
- `llm-model-settings`: adds the admin setting for the Anthropic cache lifetime.

## Impact

- Database: new migration adding columns to `llm_calls` (cache-write tokens, cache-write price, cache lifetime, raw usage) and to `llm_usage_daily` / `llm_model_usage` (cache-write tokens per lifetime).
- Server: `src/db/queries/llmUsage.ts`, `src/api/admin.ts`, the seven `llmUsage.add` call sites, `src/gemini/anthropic.ts`, `openai.ts`, `generate.ts`, `toolLoop.ts`, `llmCall.ts`, `cost.ts`, `pricing.ts`, `modelSettings.ts`, `src/db/queries/llmCalls.ts`, `src/api/llmAdmin.ts`, the admin settings route.
- Web: `AdminUsage.tsx` (cache-write column), `AdminLlmCalls.tsx` (tile, lifetime, raw usage section), `AdminSettings.tsx` (lifetime picker), `api.ts`, `i18n.tsx`.
- Cost: the first Anthropic call after the cache expired costs more than today (cache-write surcharge); calls inside the lifetime cost much less.
- Docs: `docs/pipeline.md` is not affected (no new pipeline step); Notion "Anthropic constraints" page gets a short caching note.
