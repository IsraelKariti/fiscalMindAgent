## Why

When a client's collection due date passes, the overdue scan pauses the client and hands it to the accountant. If the last planner attempt for that client had failed earlier (its `draft_failed_at` stamp is still set), the workspace keeps showing the old "drafting failed" notice with a Retry button instead of the "due date passed, agent stopped" notice. The accountant then reads a misleading cause (seen on production client bf6425fa: the planner answer was rejected on 2026-11-23, the due date passed on the night of 2026-11-24, and the page still says the draft failed). Worse, the only control the page offers in that state is Retry, and Retry is refused for a paused client ("Nothing to draft — the goal is complete or the client is paused"), so the accountant has no working way to resume from the conversation tab.

## What Changes

- A client that is paused because it was handed off (due date passed, or the client declined) shows the handed-off notice, even when a planner attempt failed or stalled before the hand-off. The failed/stuck notice and its Retry button are not shown for a handed-off client.
- The same precedence applies to a declined client: the declined notice wins over a stale failed/stuck state.
- No change to what happens on resume: resuming a handed-off client re-plans as today, which also replaces the stale failure.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `inbound-turn`: the requirement "The workspace shows the turn as in progress" gains a rule that the handed-off (overdue / declined) notice takes precedence over the "failed" and "stuck" notices.

## Impact

- `web/src/components/turnActivity.ts` (pure resolver of the timeline notice) and its test `tests/turnActivity.test.ts`.
- `web/src/components/ClientView.tsx` passes the handed-off flags into the resolver.
- No API, schema or database change: the client read already carries `overdue_stopped` and `declined`.
