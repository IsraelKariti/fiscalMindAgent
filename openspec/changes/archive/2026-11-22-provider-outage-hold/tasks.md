## 1. Data and hold state

- [ ] 1.1 Add migration `079_provider_outage_hold.sql` (`emails.screen_pending`, `document_files.outage_held_at`, `clients.outage_held_at` / `outage_held_provider` / `outage_ack_sent_at`, partial indexes), the matching `db/types.ts` fields and query helpers (`emails.markScreenPending/listScreenPending`, `documentFiles.markOutageHeld/listOutageHeld`, `clients.markOutageHeld/clearOutageHeld/listOutageHeld/countOutageHeld`); verify `npm run db:migrate` applies cleanly and `npm run typecheck` passes.
- [x] 1.2 Create `src/gemini/outageReason.ts` (pure mapping from a provider error to `billing | auth | quota | rate_limit | server | unreachable | budget`, or null for a request-specific error) with a unit test that pins the Anthropic "credit balance is too low" 400, a 401, a 429, a 503, a network failure, a timeout (null) and a plain 400 (null); verify `npm test` passes.
- [x] 1.3 Create `src/gemini/providerOutage.ts` (`ProviderHeldError`, `getHolds` with a 10 s cache, `openHold`, `clearHold`, app_settings key `llm_outage`) with a unit test for open/clear/read round trips; verify `npm test` passes.

## 2. The runner opens and obeys the hold

- [x] 2.1 In `src/gemini/llmCall.ts`, before sending: refuse with `ProviderHeldError` when primary and backup providers are held (or the budget hold is open), route straight to a healthy backup when only the primary's provider is held (with a `fallback_model` step reason "provider held"), and let `{ probe: true }` through; verify with a unit test using a stubbed hold state.
- [x] 2.2 In `src/gemini/llmCall.ts`, after `runWithBackup` fails: classify with `outageReason`, open a hold for each failed provider (and for `budget` on `LlmBudgetExceededError`), raise the `llm.provider_outage` critical alert (throttled 60 min per provider) and a platform audit row, log at warning, rethrow as `ProviderHeldError`; verify with a unit test that a timeout-only failure opens no hold and a billing 400 opens one.

## 3. Screens and files hold instead of block

- [x] 3.1 In `src/agents/shared/injectionScreen.ts`, return a `held` outcome for `ProviderHeldError` and keep the block for every other error; verify with a unit test for both paths.
- [x] 3.2 In `screenInbound.ts`: on `held` mark the message `screen_pending`, mark the client held, write one `outage.held` trace step per turn, send no fixed reply; make `inboundMessageToScreen` also pick rows with `screen_pending`; verify with a test that a held message has no `blocked`, no `injection.cycle_suppressed` row and no outbound reply.
- [x] 3.3 In `prompt.ts` thread rendering, show a `screen_pending` inbound row as the neutral "waiting for the safety check — not shown" marker; verify with the prompt fixture test.
- [x] 3.4 In `analyzeInboundFile.ts` (screen, split, classify, children): on `ProviderHeldError` mark the file `outage_held_at` (status stays pending), mark the client held, write the trace step once per turn, no quarantine, no `failed`; verify with a test that a held file keeps `analysis_status = 'pending'` and gets no injection audit row.

## 4. Planner path and turn wait

- [x] 4.1 In `src/orchestration/setFutureEmail.ts`, catch `ProviderHeldError`: mark the client held, clear the drafting state, publish, do not mark draft-failed, do not rethrow; verify with a test that `draft_failed_at` stays null and `outage_held_at` is set.
- [x] 4.2 In `src/orchestration/inboundTurnRules.ts` + `replanWorker.ts`: give `decideReplan` the held inputs (planner provider held, held files/messages of the client) so it answers 'wait' past the max wait, and re-delay at `LLM_OUTAGE_PROBE_SECONDS` while held; on boot, request a replan for every client with `outage_held_at`; verify with unit tests of `decideReplan` (held → never 'force') and a boot-recovery test.

## 5. Probe, recovery, acknowledgement

- [x] 5.1 Add `outage_probe` to the call purposes and `probeProvider(provider)` in `providerOutage.ts` (minimal `{ok}` call on the held model with `{ probe: true }`; budget → spend-cap check only); verify with a test that a successful probe clears the hold and a failing one updates `lastError` without a new alert.
- [x] 5.2 Create `src/orchestration/outageRecovery.ts` · `recoverFromOutage(provider)`: re-screen pending messages, re-analyze held files from their blobs (both inside the turn's in-flight marks), then `requestReplan` or clear the marker per client, sequential under the client lock, and raise the `llm.provider_recovered` info alert with counts; verify with a test that one client with 3 held messages and 2 held files ends with all screened/analyzed and exactly one replan request.
- [x] 5.3 Create `src/queue/outageProbeWorker.ts` (repeat job every `LLM_OUTAGE_PROBE_SECONDS`, not kill-switch-gated, no-op without holds) that probes each held provider and, when a hold is older than `LLM_OUTAGE_ACK_AFTER_SECONDS`, sends the fixed acknowledgement once per held client inside the open window; register it in the worker boot; add both env vars to `src/config/env.ts` and `.env.example`; verify with a test of the acknowledgement rule (short blip → nothing, long hold → once).

## 6. Admin API and UI

- [x] 6.1 Add `GET /api/admin/llm-outage` (holds + clients waiting) and `POST /api/admin/llm-outage/probe` (runs the probe now, returns per-provider result) in `src/api/admin.ts` with admin audit rows; verify with a route test.
- [ ] 6.2 Add the `OutageBar` to `web/src/components/AdminDashboard.tsx` (red bar on every admin page, provider + plain-words reason + since + clients waiting + "nothing is lost" + raw error fold + "retry now" with inline result, refreshed on the 30 s poll, hidden when no hold) and the held chip in `AdminSettings.tsx` LLM section and `AdminLlmStages.tsx`; verify in the browser with a hold written by hand into `app_settings.llm_outage` and `npm run typecheck`.
- [ ] 6.3 In `web/src/components/ClientView.tsx` (+ `api.ts`, `i18n.tsx`): show the "waiting for the system — the agent will continue by itself" state for `outage_held_at`, with no retry button, no "stuck" timer and no cause; keep the dot rule unchanged; verify in the browser as an accountant with a held client.
- [ ] 6.4 Show the `outage.held` trace step (admin code-steps toggle) with provider and reason kind in the step modal (`toolStepDetails.ts` / `StepDetailModal.tsx`); verify in the browser.

## 7. Docs and end-to-end check

- [x] 7.1 Update `docs/pipeline.md` with the new junctions (hold check in the runner, held outcome of the screen, held file, held planner run, probe, recovery, acknowledgement) and `docs/agents.md` if the agent contract changed; verify every new named function is listed.
- [ ] 7.2 Local end-to-end check with an invalid Anthropic key on the screen stage: send a WhatsApp text + PDF, confirm no fixed reply, no quarantine, the admin bar shows the hold, the client view shows the waiting state; restore the key, click "retry now", confirm the message is screened, the file analyzed, one reply drafted, the bar gone and both alert rows on `#/audit`.
