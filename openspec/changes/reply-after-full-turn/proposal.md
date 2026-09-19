## Why

The agent writes a reply before it has finished the work of the client's turn. WhatsApp delivers the text and every file of one client turn as separate webhooks, and today each webhook runs its own planner call right after its own file is analyzed (`onInboundWhatsApp` → `ingestWaMedia` → `onInboundMessage` → `setFutureEmail`). A client who sends one text and four files causes five planner calls and five drafts; the first ones are written without the files that are still being downloaded, screened, split or classified, and a draft whose send time is "now" can go out before the rest of the turn is processed.

## What Changes

- The planner runs **once per client turn**, not once per webhook. A turn is the run of inbound messages and files a client sends close together.
- An inbound webhook no longer calls the planner directly. It stores the message, cancels the outdated pending send (as today), processes its files, and then asks for a **deferred re-plan** for the client.
- The deferred re-plan runs only when both are true: no inbound processing is in flight for the client (download, injection screens, splitting, classification, message screen), and a short quiet window has passed since the client's last inbound webhook. Otherwise it waits and checks again.
- Every new inbound webhook of the same client pushes the re-plan further, so a burst ends in one planner call that sees every message and every analyzed file.
- A hard cap on the total wait guarantees a reply even when processing hangs or the client keeps sending.
- The workspace shows the client as "drafting" from the first webhook of the turn until the single plan is done, so the accountant does not see an empty gap.
- Unchanged: the tax-authority OTP fast path stays immediate (no wait, no planner); cancelling the outdated pending send stays immediate on every inbound; the fixed reply to a message blocked by the injection screen keeps its current behavior.
- Applies to both inbound channels (WhatsApp and email) because both go through the same `onInboundMessage` hand-off.

## Capabilities

### New Capabilities
- `inbound-turn`: when the planner runs after inbound client activity — turn grouping, the two conditions for the deferred re-plan, the wait cap, and the fast paths that skip it.

### Modified Capabilities

None. `injection-defense` says the planner runs "afterwards" for a withheld message; that still holds, only later.

## Impact

- `src/webhook/onInboundWhatsApp.ts`, `src/webhook/onInboundEmail.ts` — mark inbound processing in flight for the client; hand off to the deferred re-plan instead of planning inline.
- `src/agents/declarationOfCapital/index.ts` — `onInboundMessage` keeps the OTP fast path and the message screen, then requests the deferred re-plan instead of calling `setFutureEmail`.
- `src/orchestration/` — new `requestReplan` (debounced request) and the turn-settled check.
- `src/queue/` — new `replan` BullMQ queue and worker (delayed job per client), registered in `src/worker.ts` and in `resyncScheduledJobs.ts` if needed.
- Redis — two small per-client keys (in-flight counter, last-inbound stamp), with the `{bull}`-safe prefix rules of Managed Redis.
- `.env.example` — `INBOUND_QUIET_SECONDS`, `INBOUND_MAX_WAIT_SECONDS`.
- `docs/agents.md` — the inbound flow section.
- `tests/` — unit tests for the settle rule.
- No migration. No API change. One fewer planner call per extra webhook in a burst (lower LLM cost). The reply is later by the quiet window.
