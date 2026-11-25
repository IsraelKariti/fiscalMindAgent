## Why

Every LLM stage can have a backup model on another provider, and a call that the primary model does not answer is sent again to the backup (`llm-model-settings`). Today the only way to see how often that happens is to read the call browser row by row or grep the trace. On 2026-11-25 every planner call on `claude-opus-5` for clients with 14 planner tools failed (Anthropic's "compiled grammar is too large") and the OpenAI backup silently took them all; nobody noticed until one call was opened by hand. The admin needs one page that says, per model, what share of its calls failed and were handed to the backup.

## What Changes

- A new admin dashboard tab labeled "fallbacks" (`#/fallbacks`), visible to admins only, with one card per model that served as a primary in the chosen period: calls aimed at it, how many fell back to the backup, the percentage, split by failure reason and by stage, and what the backup made of them (answered / failed too). Models that only served as backups get a card too, with the fallback calls they took and how many they answered.
- A period picker (7 / 30 / 90 days / all), default 30 days.
- The backup call's `llm_calls` row records which primary model it replaced and why (new columns, migration), so the figures come from the call log itself, not from trace steps. Existing rows are backfilled from the `fallback_model` trace steps where a client call left one.
- The admin call browser's call modal shows "fallback for <primary model> (<reason>)" on a backup call row.

## Capabilities

### New Capabilities
- `admin-fallbacks-dashboard`: the admin-only fallbacks page — what it shows per model, the period picker, the empty state, and where its numbers come from.

### Modified Capabilities
- `llm-model-settings`: the requirement "A fallback is visible in the records" gains the backup row's fallback mark (replaced model, provider and reason) and the call modal line.

## Impact

- Database: migration `081_llm_calls_fallback.sql` adds `fallback_from_model`, `fallback_from_provider`, `fallback_reason` to `llm_calls`, with a backfill from `audit_events` rows of action `fallback_model`. Production and the local DB need it.
- Server: `src/gemini/llmCall.ts` (both fallback paths pass the mark into the log context), `src/gemini/generate.ts` (`LlmCallLogContext`, `recordCall`), `src/db/queries/llmCalls.ts` (insert + list columns), a new `src/db/queries/llmFallbacks.ts`, a pure `src/analytics/llmFallbacks.ts`, a new admin route `GET /api/admin/llm-fallbacks?days=`, registered in `src/api/router.ts`.
- Web: `web/src/components/admin/route.ts` (`fallbacks` screen), `AdminDashboard.tsx` (tab + screen), new `web/src/components/admin/AdminFallbacks.tsx`, `web/src/api.ts`, `web/src/i18n.tsx`, `web/src/styles.css`, the call modal in `AdminLlmCalls.tsx`.
- Tests: a unit test for the pure summariser, one for the backfill-free row mapping; `tests/llmStages.test.ts` untouched. Docs: `docs/agents.md` admin observability list.
- Nothing changes for accountants, staff or the monday embed: the route is admin-only, and the tab lives in the admin dashboard.
