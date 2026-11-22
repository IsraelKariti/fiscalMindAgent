## Context

See proposal.md — Why. Today's shape of the problem, as observed in the code:

- `src/gemini/generate.ts` retries 429/499/5xx/timeout/network up to 5 times; `src/gemini/llmCall.ts` (`runWithBackup`) switches to the backup on any provider failure. When nothing answers, `runLlmCall` throws the provider's error to the stage. `isProviderFailure` / `failureReasonOf` already classify the error (status, timeout, network); the spend cap throws `LlmBudgetExceededError` before a request is sent.
- `src/agents/shared/injectionScreen.ts` (`runInjectionScreen`) catches *every* error and returns a block `{ detector: 'llm', evidence: 'scan failed: …' }`. Its callers (`screenInbound.ts` → `withholdMessage` + `sendBlockedReply`; `analyzeInboundFile.ts` → `quarantineFile`) write the critical `injection.cycle_suppressed` audit row and, for a message, send the fixed reply.
- `src/orchestration/setFutureEmail.ts` wraps the planner: any throw → `clients.markDraftingFailed` (the workspace shows "drafting failed" + retry button). `src/queue/replanWorker.ts` runs the turn job with `removeOnFail: true` and no attempts, so a failed planner run is gone; the max-wait rule (`decideReplan` → 'force') plans with whatever is finished.
- Precedents to reuse: the kill switch (`src/agents/killSwitch.ts`, app_settings-backed, read by web and worker), the admin pause recovery (`src/orchestration/adminPause.ts` · `replanClientsAfterUnpause`), the throttled alert (`src/alerts/raiseAlert.ts`), the 15-minute anomaly repeat job (`src/queue/anomalyScanWorker.ts`), the admin topbar's 30-second poll (`web/src/components/AdminDashboard.tsx`).

## Goals / Non-Goals

**Goals:**
- One place decides "the provider is down" and every stage obeys it; stages never invent their own fail-closed semantics for a provider failure.
- Nothing a client sent during an outage is lost; recovery needs no human step beyond fixing the provider (paying, fixing the key).
- Three audiences, three views: admin sees cause + control, accountant sees a calm wait, client sees at most one calm line.

**Non-Goals:**
- Predicting the outage (low-balance warnings from the providers' billing APIs).
- Changing retry/backup behavior for transient failures (`llm-model-settings` stays as is).
- A general "release blocked item" admin action for true injection blocks.
- Per-stage hold granularity: the hold is per provider.

## Decisions

### D1. The hold is per provider, stored in app_settings
`src/gemini/providerOutage.ts` (new) keeps `app_settings.llm_outage` = JSON `{ [provider]: { since, kind, message, lastProbeAt, lastError } }` with `provider ∈ gemini | openai | anthropic | budget`. Read with a 10-second in-process cache (like the budget check), written on open/clear. Why app_settings: the kill switch proves web + worker share it without a deploy; a Redis key would die with the no-HA Redis. Why per provider and not platform-wide: a stage with a backup on a healthy provider keeps working (today's fallback rule), and the admin bar can name exactly what is broken. Alternative rejected: a global flag — simpler, but it would stop Gemini-served stages because Anthropic is unpaid.

### D2. Where the hold opens: in the runner, once, after everything failed
`runLlmCall` catches the final error of `runWithBackup`. If `isProviderFailure(err)` and the reason kind is a status or 'network' (not 'timeout'), it calls `openHold(provider, reason)` for each provider that failed (primary; backup when it failed too) and rethrows a new `ProviderHeldError` (carries provider + kind) so callers can tell "held" from "broken". `LlmBudgetExceededError` opens the `budget` hold the same way. Reason kinds, mapped from the status + the provider's error body: `billing` (Anthropic 400 `invalid_request_error` with "credit balance" in the text; OpenAI 429 `insufficient_quota`; Gemini 403/429 whose message mentions billing or quota exceeded), `auth` (401/403 otherwise), `rate_limit` (429 otherwise), `server` (5xx), `unreachable` (network), `budget`. The mapping lives in `src/gemini/outageReason.ts` as a pure function with a unit test — the texts come from the three SDK error objects, so the test pins each one. Alternative rejected: opening the hold on the *first* attempt's error — would open holds on blips that the retry loop already absorbs.

### D3. Where the hold is checked: before the request leaves
`runLlmCall` resolves primary + backup, then: if the primary's provider is held and the backup's provider is not → send straight to the backup (recorded as a `fallback_model` step with reason "provider held"); if both are held (or no backup) → throw `ProviderHeldError` without a request. `budget` held → throw. The probe passes `{ probe: true }` to bypass. Only this one choke point; no stage checks the hold itself.

### D4. Screens hold instead of block
`runInjectionScreen` returns a third outcome: `{ held: { provider, kind } }` when the caught error is `ProviderHeldError`; any other error keeps today's block. Callers:
- `screenInboundMessage`: on `held` → `emails.markScreenPending(id)` (new column `screen_pending boolean not null default false`), `clients.markOutageHeld(clientId, provider, kind)`, audit step `outage.held` (warning, admin-visible, detail provider/kind/target), no fixed reply, `return { blocked: false, held: true }`. `inboundMessageToScreen` also picks up rows with `screen_pending` (that is how recovery re-screens them). The planner prompt (`prompt.ts` thread rendering, next to the `withheld` marker) renders a pending row as "[message waiting for the safety check — not shown]"; the planner should not run while any such row exists, but this is the defense in depth.
- `analyzeInboundFile`: on `held` from the screen, split or classification (`classifyAndStore` / `classifyChildren` / `splitIntoChildren` catch `ProviderHeldError` separately from other errors) → `documentFiles.markOutageHeld(id)` (new column `outage_held_at timestamptz`, `analysis_status` stays `pending`), mark the client held, audit step, return. The existing `countRecentPendingForClient` keeps counting it as pending; `decideReplan` gets `heldFiles` as a new input (see D6).

### D5. The planner path marks the client held, not failed
`setFutureEmail`'s catch: `err instanceof ProviderHeldError` → `clients.markOutageHeld` + `clearDraftingState` (no `markDraftingFailed`), publish, swallow (no rethrow: the replan job must not fail/vanish). New `clients.outage_held_at timestamptz`, `outage_held_provider text`, cleared by recovery. `verifyDocument` and the kickoff path use the same `setFutureEmail` wrapper or the same catch; the overdue/import scans skip a client whose needed provider is held (they re-run daily anyway).

### D6. The replan job waits during a hold
`replanWorker.onReplan`: before `decideReplan`, read the hold state; `decideReplan` gets `{ heldFiles, providerHeld }`: when the planner's provider is held, or the client has held files/messages, the decision is 'wait' even past the max wait (no 'force'), and the job re-delays itself at `LLM_OUTAGE_PROBE_SECONDS` instead of 2 s to spare Redis. The job therefore survives the whole outage without failing. Boot recovery (`RECOVERY_WINDOW_SECONDS`) is widened for held clients: on boot, every client with `outage_held_at` set gets `requestReplan` regardless of the window.

### D7. Probe worker + admin "retry now"
`src/queue/outageProbeWorker.ts`: repeat job every `LLM_OUTAGE_PROBE_SECONDS` (default 300, env-driven like the other schedulers), NOT kill-switch-gated (like the anomaly scan). It no-ops when no hold is open. For each held provider: `probeProvider(provider)` = one `runLlmCall` with `{ probe: true, model: <the first configured model of that provider: the held stage's model recorded in the hold> }`, fixed system instruction "Answer {ok:true}", schema `{ ok: boolean }`, temperature 0, logged to llm_calls with purpose `outage_probe` (a new `LlmCallPurpose`, no admin model picker — it reuses the held model). For `budget`: `assertWithinBudget` only. Success → `clearHold(provider)` → `recoverFromOutage(provider)` (D8). `POST /api/admin/llm-outage/probe` runs the same function at once and returns `{ provider: 'recovered' | { stillFailing: message } }`. `GET /api/admin/llm-outage` returns the holds + `clientsWaiting` (count of clients with `outage_held_at`).

### D8. Recovery order: screens, files, then one plan per client
`src/orchestration/outageRecovery.ts` · `recoverFromOutage(provider)`: (1) for every email with `screen_pending`: `turnStore.inflight` around `screenInboundMessage` again; (2) for every file with `outage_held_at`: read the blob, `turnStore.inflight` around `analyzeStoredFile`; (3) for every client with `outage_held_at`: if complete/paused/declined → clear the marker; else `requestReplan(clientId)` (the normal turn: quiet window, in-flight wait) and clear the marker. Clients are processed sequentially with `withClientLock` like `replanClientsAfterUnpause`; an item that hits a hold again stays marked and the hold reopens by D2. The recovery alert reports the counts. Why `requestReplan` and not `setFutureEmail` directly: the turn rules guarantee one plan after all re-screens/re-analyses finished.

### D9. Alerts and trace
`raiseAlert({ rule: 'llm.provider_outage', scopeKey: provider, severity: 'critical', throttleMinutes: 60 })` on open; `rule: 'llm.provider_recovered'`, severity info, on clear. Both also `recordAudit` platform-level rows (`actorType: 'system'`, no client) so `#/audit` shows the span. Per client, one `outage.held` code step per turn (not per message) — the first held item of a turn writes it; later items of the same turn find `outage_held_at` already set and skip the step.

### D10. Client acknowledgement
In the probe worker tick (so it runs only while a hold is open): if `now - hold.since ≥ LLM_OUTAGE_ACK_AFTER_SECONDS` (default 600; 0 disables), for every held client with `outage_held_at` set, `outage_ack_sent_at` null, a WhatsApp phone and an open 24-hour window: `sendWhatsAppTextAndRecord` with the fixed text (reasoning `outage acknowledgement, no model`) and set `outage_ack_sent_at` (cleared with the held marker at recovery). Text (Hebrew): "קיבלתי, תודה. יש עיכוב קצר מצידנו, אחזור אליך בהקדם." Why delayed: a two-minute blip must not produce chatter; why fixed: no model is available.

### D11. UI
- Admin shell (`AdminDashboard.tsx`): an `OutageBar` component above the tabs, fed by `GET /api/admin/llm-outage` on the existing 30-second poll; red `error-banner` style; per provider: name, kind in plain Hebrew ("בעיית תשלום או יתרה", "מפתח API לא תקין", "חריגה ממכסה", "התקלה אצל הספק", "לא ניתן להתחבר", "תקרת ההוצאה היומית"), since (local time), the raw error text in a `details` fold, "X לקוחות ממתינים", "שום דבר לא אבד", a "נסה שוב עכשיו" button that calls the probe and shows the result inline. `AdminSettings.tsx` LLM section and `AdminLlmStages.tsx` show a small red chip next to a held provider's models.
- Accountant workspace (`ClientView.tsx`): the drafting placeholder gets a third branch, `client.outage_held_at != null` → `t.draftingHeld` ("ממתין למערכת — הסוכן ימשיך לבד") with no retry button and no "stuck" timer; the dot rule is untouched (blue). `Timeline.tsx`: a `screen_pending` message bubble renders normally for the accountant (no badge — the accountant may read it; the restriction is on models); the held trace step shows under the code-steps toggle for admins.

## Risks / Trade-offs

- [A hold stops a provider for every accountant at once] → it opens only after retries + backup failed with a status/network error, and the probe clears it within one interval; the admin can retry now.
- [A flapping provider opens/clears repeatedly] → the alert throttle (60 min per provider) keeps the email count down; recovery is idempotent (held markers, `requestReplan` is a no-op while a turn is pending).
- [Recovery storms the provider right after it recovers] → recovery is sequential per client and goes through the normal turn/quiet rules; file re-analysis is one at a time.
- [`screen_pending` rows reaching a prompt] → the planner never runs while held rows exist (D6) and the prompt renders them as a marker anyway (D4).
- [Misclassifying a request-specific 400 (too large, bad schema) as an outage] → only billing/auth/quota/429/5xx/network kinds open a hold; a plain 400 without a billing text is kept as today (stage fails, no hold) — covered by the `outageReason` unit test.
- [Probe cost] → one tiny call per interval per held provider, only while held.

## Migration Plan

1. Migration `079_provider_outage_hold.sql`: `emails.screen_pending`, `document_files.outage_held_at`, `clients.outage_held_at`, `clients.outage_held_provider`, `clients.outage_ack_sent_at`, partial indexes on the three nullable/boolean markers. Run `npm run db:migrate` locally; production runs it in the deploy flow.
2. Deploy web + worker together (the hold state is read by both; an old worker would still fail closed, which is today's behavior, so a mixed window is safe).
3. Rollback: revert the code; the columns are harmless when unused. A hold left in `app_settings.llm_outage` is ignored by old code.

## Open Questions

None that change the specs. Deferred detail: the exact Gemini and OpenAI billing error texts to pin in the `outageReason` test will be taken from the SDK types and from the next real occurrence; until then those providers' billing errors classify as `quota`/`auth`, which still opens a hold.
