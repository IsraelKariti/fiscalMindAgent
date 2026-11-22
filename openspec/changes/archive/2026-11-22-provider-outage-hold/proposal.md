## Why

On 2026-11-22 the Anthropic account ran out of credits. Every model call failed for over an hour, and the system treated "the model did not answer" exactly like "the content is dangerous": ten client messages were withheld, nine files were quarantined, the client received the "we cannot process your message" reply ten times, and the planner job failed and was dropped. A problem on our side (billing, a bad key, a quota, a provider outage, the daily spend cap) must never look like a problem with the client, and must never need the client to send everything again.

## What Changes

- **A model-provider outage is a platform state, not a content verdict.** When a model stage fails because the provider did not serve it (billing/credit, authentication, quota, server errors, unreachable) or because the daily spend cap refused it, the platform enters a *hold* for that provider. While held, no model call is sent to that provider and every piece of work that needs it waits.
- **Hold, do not judge.** An inbound message or file whose injection screen could not run is marked *waiting for the safety check* — not withheld, not quarantined, no injection audit row, no fixed "cannot process" reply. It stays out of the model's sight until the screen actually runs.
- **The client's turn waits instead of failing.** The deferred planner run of a client whose work is held re-checks until the hold clears; the maximum-wait rule does not force a plan during a hold. A planner call that hits the outage marks the client *held by the system*, not *draft failed*.
- **Automatic recovery.** A probe retries the held provider every few minutes (and on an admin "retry now" click). When it answers, the system re-screens the waiting messages, re-analyzes the waiting files and re-plans every held client, in order, so each client gets one reply.
- **The admin is told at once.** One critical alert (row + email) when a hold opens, one when it clears, and a red bar on every admin page naming the provider, the reason, since when, and how many clients are waiting, with a "retry now" button.
- **The client is kept calm.** No error text. If the hold lasts longer than a configured delay, each client who wrote during the hold gets one fixed, model-free WhatsApp line saying there is a short delay on our side (once per outage).
- **The accountant sees a neutral state.** The client shows "waiting for the system, the agent will continue by itself" instead of "drafting failed" or "stuck"; the client dot stays blue (in progress). The cause (billing, key) is admin-only.
- Assumption recorded: the client acknowledgement is on by default with a 10-minute delay; both are env-configurable.

## Capabilities

### New Capabilities
- `llm-provider-outage`: how the platform detects that a model provider (or the spend cap) cannot serve calls, holds the work that needs it, probes for recovery, recovers the held work, and what admins, accountants and clients see meanwhile.

### Modified Capabilities
- `injection-defense`: a screen that could not run no longer "blocks like a hit"; it holds the content as unscreened (still never shown to the model) and raises no injection verdict.
- `inbound-turn`: a file or message held by a provider outage counts as in flight, not as finished; the maximum wait does not force a planner run while the needed provider is held; the fixed blocked-message reply is not sent for an unscreened message.

## Impact

- Code: `src/gemini/` (call runner, failure classification, new outage module + probe), `src/agents/shared/injectionScreen.ts`, `src/agents/declarationOfCapital/` (screenInbound, analyzeInboundFile, prompt thread rendering), `src/orchestration/setFutureEmail.ts`, `src/queue/replanWorker.ts` + a new probe worker, `src/alerts/`, `src/api/admin.ts`, `src/webhook/analyzeStoredFile.ts`.
- Data: migration 079 — `emails.screen_pending`, `document_files.outage_held_at`, `clients.outage_held_at`; app_settings key `llm_outage` (per-provider hold state). Production needs the migration.
- UI: admin shell bar + settings section + stages page state; accountant client view wording; trace step for the hold.
- Env: `LLM_OUTAGE_PROBE_SECONDS` (default 300), `LLM_OUTAGE_ACK_AFTER_SECONDS` (default 600, 0 = never acknowledge) — documented in `.env.example`.
- Docs: `docs/pipeline.md` rows for the new junctions.
