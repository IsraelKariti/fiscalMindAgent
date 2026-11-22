## Why

The client page shows "the agent is drafting the next message…" from the moment a client message arrives, through the whole quiet window, the file analysis and the planner call alike: it infers "drafting" from "goal open and nothing scheduled". The owner sees a drafting bubble at 20:25 for a message whose planner run is still two minutes away (production client 709bbbf1, 2026-11-22), and cannot tell real work from a timer. The page should show what the agent is actually doing: "processing" while it analyzes the inputs, nothing while it only waits for a timer, "drafting" only while the planner writes the reply.

## What Changes

- The client row records two activities instead of one: `processing_since` (the inputs of the turn are being analyzed: inbound media ingestion, file split/classification, document verification) and `drafting_since` (a planner run is writing the message). The inbound webhooks and the file analysis stamp processing, not drafting; the planner stamps drafting; a verification batch inside a planner run stamps processing and hands back to drafting for the follow-up cycle.
- The conversation timeline shows a "processing" bubble (Hebrew: the agent is processing the received messages and files) while processing, the existing "drafting" bubble only while drafting, and nothing while the agent only waits for a timer (the quiet window after the client's last message, the delay after the agent's own message). It no longer infers "drafting" from an empty schedule.
- "Stuck" with Retry is shown when an activity stamp is older than 3 minutes, or when the goal is open, nothing is scheduled, no run is queued and nothing has happened for 3 minutes (a lost run). "Failed" and "held by the system" stay as today.
- The client read of the workspace API serves the due time of any queued planner run (turn or after-send), so the page can tell a timer wait from a lost run and refetch when the wait ends.
- Boot recovery of lost runs looks at both stamps.
- Supersedes the wording of the unarchived change `after-send-wait-state` (its "nothing during the after-send wait" becomes one case of "nothing during a timer wait").

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `inbound-turn`: "The workspace shows the turn as in progress" becomes "The workspace shows what the agent is doing" (processing / nothing / drafting / stuck).
- `verification-reply`: "The turn stays visibly in progress" — processing during the verification batch, drafting during the planner cycles.

## Impact

- `migrations/080_client_processing_since.sql`, `src/db/types.ts`, `src/db/queries/clients.ts` (new stamp functions; recovery queries read both stamps).
- `src/webhook/onInboundWhatsApp.ts`, `src/webhook/onInboundEmail.ts`, `src/agents/declarationOfCapital/analyzeInboundFile.ts`, `src/agents/declarationOfCapital/verifyDocument.ts`, `src/agents/declarationOfCapital/plan.ts`, `src/queue/replanWorker.ts`, `src/orchestration/setFutureEmail.ts` — which stamp each site sets.
- `src/orchestration/inboundTurnCore.ts`, `src/orchestration/requestReplan.ts`, `src/api/workspace.ts` — due time of any queued run.
- `web/src/api.ts`, `web/src/components/ClientView.tsx`, `web/src/components/Timeline.tsx`, `web/src/agents/types.ts`, `web/src/agents/declarationOfCapital.tsx`, `web/src/i18n.tsx` — the three states.
- `tests/inboundTurn.test.ts`, a new `tests/turnActivity.test.ts` for the pure state resolver; `docs/pipeline.md`.
- Production needs migration 080 (runs in the deploy flow); local DB needs `npm run db:migrate`.
