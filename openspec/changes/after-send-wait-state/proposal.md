## Why

Since `after-send-plan-delay` the planner waits one hour after a delivered message before drafting the next follow-up, but the workspace does not know about that wait: with the goal open and nothing scheduled it shows "the agent is drafting the next message…" and, three minutes later, "drafting took longer than expected and is probably stuck" with a Retry button. Production client 0c488c45 on 2026-11-22: message delivered 19:01, nothing wrong, the page showed the stuck warning from 19:04 until the planner ran at 20:01. The accountant sees a false failure and may press Retry, which plans at once and defeats the wait.

## What Changes

- The client read of the workspace API reports when the pending after-send planner run is due (`planWaitUntil`), taken from the client's queued run.
- During that wait the conversation timeline shows nothing after the delivered message: no drafting placeholder, no "stuck" notice, no Retry button and no waiting sentence. The timeline simply ends at the last message.
- The fast drafting poll (every 3 s) does not run during the wait; the page refreshes when the wait time passes, so the drafting placeholder appears when the planner actually starts.
- No change to timing, the planner, or the client dot; no change to a wait whose job was lost (the old drafting → stuck fallback stays until the worker's boot recovery re-adds the wait).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `inbound-turn`: new requirement "The workspace shows the after-send wait" next to "The workspace shows the turn as in progress".

## Impact

- `src/api/workspace.ts` — the GET client route adds `planWaitUntil`; a small helper in `src/orchestration/inboundTurnCore.ts` / `requestReplan.ts` reads the due time of the queued after-send run.
- `web/src/api.ts`, `web/src/components/ClientView.tsx`, `web/src/components/Timeline.tsx`, `web/src/agents/types.ts`, `web/src/agents/declarationOfCapital.tsx` — the silent waiting state.
- `tests/inboundTurn.test.ts` — the due-time helper.
- `docs/pipeline.md` — the after-send row names the workspace state.
