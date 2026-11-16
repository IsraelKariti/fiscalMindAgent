## Why

Every planner cycle ends with a scheduled WhatsApp draft, and every client reply, file verification, tax fetch or admin action throws that draft away and drafts again. Each thrown-away draft cost one or more planner calls, but nothing today counts them, so nobody can see how much money dies in discarded drafts, why they are discarded, or how long they lived before they died.

## What Changes

- An outbound draft remembers what started its planning cycle (a client message, the agent's own sent message, a file verification, a tax fetch, the kickoff, an admin action...), its planned send time, and when and why it was discarded (new `emails` columns, migration 076). Every discard path stamps the row through the one cancel function; old rows are backfilled from the audit trail and the thread.
- Every LLM call made inside one planning cycle carries that cycle's id (new `llm_calls.plan_run_id`), and the draft the cycle scheduled carries the same id, so the cost of a draft is the sum of its cycle's calls.
- The workspace Settings view gets an admin-only **analytics** tab ("ניתוח"), after the test tab, visible only while an admin views as the accountant. It shows, for the agent instance and a chosen date range:
  - headline tiles: drafts written, sent, discarded, discard rate, money spent on discarded drafts, money spent on all drafts, waste share;
  - discards by reason (client reply, file verification, tax fetch, admin redraft/pause/resume, client declined, goal change, channel change, client deleted, unknown);
  - drafts by trigger: for each thing that started a cycle (client message, agent message sent, file verification, ...) how many drafts were written, sent and discarded, the discard rate, the discarded cost and the most common discard reason;
  - lifetime of discarded drafts: median and average time alive, time alive as a share of the planned wait, and a histogram of time-alive buckets;
  - a weekly trend of drafted vs discarded counts and cost;
  - the ten clients that wasted the most, each linking to the client.
- A new admin-only route serves the figures for one agent instance.

## Capabilities

### New Capabilities
- `discarded-message-analytics`: how a draft's planned time, discard time and discard reason are recorded, how a draft's cost is attributed to its planning cycle, and what the admin-only analytics tab shows.

### Modified Capabilities
- `admin-test-client`: the Settings tab list gains the analytics tab after the test tab (the "Admin sees the tab" scenario names the full tab order).

## Impact

- Database: migration 076 (`emails.plan_trigger`, `emails.scheduled_for`, `emails.discarded_at`, `emails.discard_reason`, `emails.plan_run_id`, `llm_calls.plan_run_id`, backfill of old drafts). Local DB and production need it.
- Backend: `removeFutureEmail` takes a reason and stamps the discarded draft; its 13 call sites pass their reason; `scheduleDraftMessage` stores the planned time and run id; `setFutureEmail` takes a trigger from each of its 14 callers, mints a run id and passes both to the planner, which passes the run id to every LLM call of the cycle through `LlmCallLogContext`; new query module and admin route; `docs/pipeline.md` and `docs/agents.md` updated.
- Web: `Settings.tsx` tab list, new `MessageAnalyticsTab` component and pure analytics module (tested like `costGraph.ts`), new `api.ts` function, Hebrew strings in `i18n.tsx`.
- The accountant's own session, staff viewers and the monday embed see nothing new.
