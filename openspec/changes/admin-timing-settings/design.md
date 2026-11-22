## Context

See proposal.md — Why. The three values are read from `env` once, at module load: `requestReplan.ts` bakes `quietMs` and `delayMs` into the requester closures, `inboundTurn.ts` bakes the max wait into the turn store's Redis TTL, `replanWorker.ts` reads `env` inside `onReplan` and in boot recovery, and `messageAnalyticsAdmin.ts` reports `currentQuietSeconds`. Admin-set values already live in `app_settings` (model per stage, budget, kill switch) and are read from the DB per call so the web and worker pick them up without a restart; the budget section of `AdminSettings.tsx` (GET/PUT `/api/admin/llm-budget`, two numeric inputs, one Save) is the closest UI pattern.

## Goals / Non-Goals

**Goals:**
- One place (`timingSettings.ts`) that resolves each value: saved setting → env → code default.
- Every timing decision reads the current value; no restart.
- No behaviour change until an admin saves.

**Non-Goals:**
- Per-agent-instance or per-client timing (one platform-wide value each, like the budget).
- Re-timing a wait that is already queued (the next inbound or the next send picks up the new value).
- Removing the env variables.

## Decisions

**Settings module, env as fallback.** `src/orchestration/timingSettings.ts` exports `getMessageTiming()` → `{ quietSeconds, maxWaitSeconds, afterSendDelaySeconds }` with keys `message_timing:quiet_seconds`, `message_timing:max_wait_seconds`, `message_timing:after_send_delay_seconds` in `app_settings`; a missing or unparsable row falls back to the env value. `saveMessageTiming(next)` validates (integers; quiet ≥ 1; max wait ≥ quiet; after-send ≥ 0) and upserts all three. Alternative considered: a single JSON row — rejected, the existing settings are one key per value and the admin page reads them that way.

**Requesters take the value as a function.** `createReplanRequester({ quietMs: () => Promise<number> })` and `createAfterSendReplanRequester({ delayMs: () => Promise<number> })` accept a provider instead of a number (the tests pass `async () => QUIET_MS`). `requestReplan.ts` wires `() => getMessageTiming().then(t => t.quietSeconds * 1000)`. `onReplan` and `recoverLostReplans` call `getMessageTiming()` once per run. The turn store's Redis TTL stays `max(env max wait, 1 day)`-style: it only bounds key lifetime, so it is set to the env value plus a safety margin and is not re-read (a longer admin max wait than the TTL would expire the turn keys early — the TTL is set to 24 h to make that impossible in practice).

**Validation lives in the module, errors in the route.** PUT `/api/admin/message-timing` parses `{ quietSeconds, maxWaitSeconds, afterSendDelaySeconds }` with zod (non-negative integers), then `saveMessageTiming` throws a typed error for the cross-field rule; the route answers 400 with a plain message, the section shows it and keeps the saved values (same pattern as the model routes' provider conflict).

**Analytics "now" marker.** `messageAnalyticsAdmin.ts` reports `currentQuietSeconds` from `getMessageTiming()`, so the wait curve marks the effective value.

**Boot recovery.** `recoverLostReplans` uses the effective after-send delay for both the query bound and the remaining delay, so a saved shorter delay also shortens recovered waits.

## Risks / Trade-offs

- [One DB read per timing decision] → three small `app_settings` reads per inbound webhook / replan / send; the model settings already do this per LLM call. Acceptable.
- [Admin sets a very short quiet window] → bursts of files may be planned in several runs; the replan worker already waits for all pending files, and the dirty flag re-plans once more. No data loss, only extra planner calls. The section's description says this.
- [Admin sets a very long max wait] → bounded by the turn-store TTL (24 h); documented in the module.
- [Env value removed later] → code defaults remain (15 / 300 / 3600), so the settings still resolve.
