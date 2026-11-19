## Why

Right after the agent delivers a message, the send worker runs the planner at once to draft the next follow-up. Most clients answer within minutes, so that draft is thrown away by the reply's re-plan and its LLM call is wasted (production client 38a5d638, 2026-11-19: sent 14:59:01, next draft 14:59:08, client reply 14:59:40, draft discarded). The next follow-up is never due sooner than hours later, so there is no reason to plan it immediately.

## What Changes

- After a message is **delivered**, the planner run that drafts the next follow-up is deferred by a configured delay (new env var `AFTER_SEND_PLAN_DELAY_SECONDS`, default 3600). It is not run at once any more.
- The deferred run is the client's single re-plan job. A client reply inside the delay replaces it with the normal inbound turn (quiet window, max wait), so only one planner run happens, with the reply as its trigger.
- A send that did **not** go out (24h window closed, draft no longer sendable) still re-plans at once, as today.
- A deferred after-send run lost with Redis (worker restart, eviction) is re-requested on worker boot for the remaining delay.
- The deferred run keeps the trigger `agent_message_sent` on the draft it produces (discarded-message analytics unchanged).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `inbound-turn`: a new requirement "The next plan after a delivered message waits"; the re-plan request and the recovery requirement are widened to cover the after-send run.

## Impact

- `src/queue/sendEmailWorker.ts` — after a delivered send, request the deferred run instead of calling `setFutureEmail` directly.
- `src/orchestration/inboundTurnCore.ts`, `src/orchestration/requestReplan.ts`, `src/queue/replanWorker.ts` — job data carries the run kind and trigger; an inbound request never inherits the turn start of an after-send job; boot recovery covers after-send waits.
- `src/db/queries/clients.ts` — one query that finds clients whose last outbound was delivered and nothing is planned.
- `src/config/env.ts`, `.env.example` — the new variable; production app settings get the value (deploy step, both web and worker).
- `docs/pipeline.md` — one new row for the after-send wait.
- `tests/inboundTurn.test.ts` — cases for the after-send request and the merge with an inbound turn.
- Workspace: during the delay the client shows no scheduled bubble and no drafting state (accepted by the owner; no UI change).
