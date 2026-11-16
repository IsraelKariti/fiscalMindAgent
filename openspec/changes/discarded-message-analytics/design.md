## Context

- A planning cycle (`setFutureEmail` → `plan.ts`) ends in `scheduleDraftMessage`, which inserts an `emails` row (status `draft`, or `held`) and a `scheduled_jobs` mirror row holding the planned time. `removeFutureEmail` is the only cancel path: it deletes the mirror row and drops the BullMQ job, but leaves the `emails` row as it was. The planned time therefore vanishes with the mirror row, and nothing says when or why the draft died.
- The admin conversation route (`llmAdmin.ts`) already recognises a discarded draft as "outbound, status draft/held, not the live job's draft", and guesses the planner call that wrote it by time order. That guess is fine for a timeline, not for money.
- `llm_calls` rows are written fire-and-forget after the answer returns (`recordCall` in `src/gemini/generate.ts`), so the planner never learns its own row id. One cycle may make several calls: the planner, a corrective retry, OpenAI continuation calls, the backup model, the follow-up write.
- `removeFutureEmail` has 13 callers; each knows why it cancels.
- Settings tabs: `Settings.tsx` holds `general | agent | staff | test | dashboard`; the admin-only test tab is rendered from `agentUI.adminTestPanel` under `impersonating`. Admin instance routes live under `/api/admin/agents/:agentInstanceId/...` with `requireAdmin`. The cost graph tab (`costGraph.ts` + `tests/costGraph.test.ts`) is the pattern for a pure, tested analytics module and `charts/LineChart.tsx` + `charts/common.tsx` the pattern for a chart with tooltips.

## Goals / Non-Goals

**Goals:**
- Record the facts at the moment they happen (planned time, discard time, reason, cycle id) instead of guessing them later.
- Attribute cost exactly: a draft's cost is the recorded cost of its cycle's calls, unknown when the cycle predates the change.
- Keep every computation in one pure module on the server so the web tab only renders.

**Non-Goals:**
- Changing when the agent drafts (lazy drafting is the decision the analytics should inform, not part of this change).
- Any figure for the accountant: the tab, the route and the data are admin-only.
- Rewriting the timeline's `discarded` flag in `llmAdmin.ts` (it keeps its time-order heuristic; a later change may switch it to the cycle id).

## Decisions

### 1. Five columns on `emails`, one on `llm_calls` (migration 076)
- `emails.plan_trigger text` with a CHECK over the 12 triggers (`client_message`, `agent_message_sent`, `file_verification`, `tax_fetch`, `kickoff`, `team_answer`, `admin_redraft`, `review_regenerate`, `admin_unpause`, `resume`, `goal_reopened`, `channel_changed`), set by `scheduleDraftMessage` from the cycle's hints.
- `emails.scheduled_for timestamptz` — set by `scheduleDraftMessage` for every draft (queued or held).
- `emails.discarded_at timestamptz`, `emails.discard_reason text` with a CHECK over the 13 reasons (`client_message`, `file_verification`, `tax_fetch`, `admin_redraft`, `admin_pause`, `resume`, `client_declined`, `goal_changed`, `channel_changed`, `client_deleted`, `send_settled`, `review_regenerate`, `unknown`).
- `emails.plan_run_id uuid`, `llm_calls.plan_run_id uuid`, index `llm_calls (plan_run_id)` and partial index `emails (client_id, discarded_at) WHERE discarded_at IS NOT NULL`.
- Alternative rejected: a separate `draft_outcomes` table. One row per draft already exists; extra columns are simpler to query and to backfill.

### 2. `removeFutureEmail(clientId, reason)` stamps the draft
Before `scheduledJobs.deleteForClient`, parse the email id from the mirror row's job id (`send:<client>:<email>`, same as `resumeFutureEmail`) and run `emails.markDiscarded(emailId, reason)`: `UPDATE ... SET discarded_at = now(), discard_reason = $2 WHERE id = $1 AND status IN ('draft','held') AND discarded_at IS NULL`. The `status` guard keeps a sent row clean (the `send_settled` caller runs after the send, when the row is already `sent`). Rows superseded from review (`supersedePendingReview`) are stamped in the same update with the same reason. The reason is a required parameter so TypeScript forces every caller to say why; `resumeFutureEmail` passes `resume` only on its redraft fall-through, so a restored held draft is never stamped.

Caller → reason map: `onInboundWhatsApp` / `onInboundEmail` → `client_message`; `replanWorker` → `client_message` (the deferred turn); `verifyDocument` → `file_verification`; `taxFetch/deliver`, `taxFetch/runner` → `tax_fetch`; `workspace.ts` redraft (line ~638) → `admin_redraft`; `adminPause` → `admin_pause`; `resumeFutureEmail` → `resume`; `clientDeclineRules` → `client_declined`; `router.ts` goal complete/reopen → `goal_changed`; `workspace.ts` WhatsApp enable/update (~389, ~452) → `channel_changed`; `workspace.ts` delete (~477) → `client_deleted`; `sendEmailWorker` → `send_settled`; `reviewAdmin` regenerate → `review_regenerate`.

### 3. A cycle id and a trigger thread through `PlanHints`
`setFutureEmail(clientId, trigger: PlanTrigger, hints?)` takes the trigger as a required parameter so every caller says what started the cycle: `replanWorker` → `client_message`; `sendEmailWorker` → `agent_message_sent`; `verifyDocument` → `file_verification`; `taxFetch/deliver`, `taxFetch/runner` → `tax_fetch`; `draftFirstEmail` → `kickoff`; `workspace.ts` team-question close (~697) → `team_answer`; `workspace.ts` redraft (~639) → `admin_redraft`; `reviewAdmin` → `review_regenerate`; `adminPause` → `admin_unpause`; `resumeFutureEmail` → `resume`; `router.ts` goal reopen → `goal_reopened`; `workspace.ts` WhatsApp enable/update → `channel_changed`. It mints `planRunId = randomUUID()` and passes both as `hints.planRunId` / `hints.trigger`; `plan.ts` keeps it on `PlanRun` and puts it in every `log` context it builds (`askPlanner`, the follow-up write, any other `planner`-purpose call), through a new optional `LlmCallLogContext.planRunId` that `recordCall` copies into the row. `scheduleDraftMessage` receives both and stores them on the draft (`plan_run_id`, `plan_trigger`). Cost of a draft = `SUM(llm_calls.cost) WHERE plan_run_id = emails.plan_run_id`; a draft with a null `plan_run_id`, or whose calls are all unpriced, reports `cost: null` (unknown).
- Alternative rejected: updating `llm_calls.email_id` after the draft exists. The row may not be written yet (fire-and-forget), so the update can miss.

### 4. Backfill in the migration, SQL only
For every outbound row: `plan_trigger` = `client_message` when the nearest earlier row of the same client (by `COALESCE(sent_at, created_at)`) is inbound, `agent_message_sent` when it is a sent outbound row, `kickoff` when there is none; an earlier unsent draft is skipped over (it was discarded, not delivered).

For every outbound row with `status IN ('draft','held')` whose id is not the `scheduled_jobs` row's email id of its client:
- `discarded_at` = the smallest `COALESCE(sent_at, created_at)` of a later row of the same client (`created_at > this.created_at`), else NULL.
- `scheduled_for` = `(detail->>'sendAt')::timestamp AT TIME ZONE 'Asia/Jerusalem'` from the newest `audit_events` row with `action IN ('send_reply','send_whatsapp_text','send_whatsapp_template')` and `detail->>'emailId' = emails.id::text`, when the label matches `^\d{4}-\d{2}-\d{2} \d{2}:\d{2}` (the `wallClockLabel` format); else NULL.
- `discard_reason = 'unknown'`.
`plan_run_id` is not backfilled: pre-change cost stays unknown by design (spec: never zero).

### 5. One server module computes everything
`src/analytics/discardedMessages.ts` exports a pure `summarize(drafts, { from, to, now })` over rows of `{ id, clientId, clientName, clientDeleted, createdAt, sentAt, planTrigger, scheduledFor, discardedAt, discardReason, cost }`, returning the figures the spec lists (tiles, reasons, triggers with their most common reason, lifetime stats + wait curve, weekly buckets, top clients). `src/db/queries/draftOutcomes.ts` loads the rows for one instance with one query (`emails` join `clients` for name/deleted/test, left join a `SUM(cost)` subquery on `plan_run_id`, a lateral `MAX(created_at)` of the client's inbound rows before the draft for the wait curve, where `clients.agent_instance_id = $1`, outbound, created in range). The route `GET /api/admin/agents/:agentInstanceId/message-analytics?from=&to=` (`requireAdmin`, new handler in `llmAdmin.ts` or a sibling `messageAnalyticsAdmin.ts`) returns `summarize`'s result as JSON plus the instance's first draft day for the "all" preset. Range filtering happens in SQL by `created_at`; weekly bucketing by Monday happens in the pure module in the accountant timezone (`env.ACCOUNTANT_TIMEZONE`), matching the spec's "browser's local time" for an Israel-based admin.
- Alternative rejected: computing in the browser like the cost graph. The instance can hold thousands of drafts across clients; one aggregated reply is lighter and the module is testable with plain node tests either way.

### 6. Web: `MessageAnalyticsTab` behind a new Settings tab
- `Settings.tsx`: `Tab` gains `'analytics'`; `adminAnalyticsPanel?: ReactNode` prop rendered only when `!viewerOnly && impersonating`, button after test with `client-tab-admin` and `adminOnlyTabTitle`; stored `'analytics'` falls back to `general` outside view-as.
- `Workspace.tsx` passes `adminAnalyticsPanel={<MessageAnalyticsTab agentInstanceId={agent.id} onOpenClient={...} />}` beside `adminTestPanel` (shared component, not per agent type: the data is generic to every agent).
- `web/src/api.ts`: `adminGetMessageAnalytics(agentInstanceId, { from, to })`.
- Formatting helpers (`formatDuration`, wait-curve tick labels, percentages) in `web/src/components/messageAnalytics.ts`, pure and tested in `tests/messageAnalytics.test.ts`; `formatUsd` reused; the weekly chart uses `charts/LineChart.tsx` (written and discarded as two series, cost in the tooltip via `extraTip`) rather than a new bar chart.
- Presets/dates as in the cost graph (`presetRange` reused where possible); the preset is stored under `fm.messageAnalytics.range`.
- Strings in `i18n.tsx`: `settingsTabAnalytics: 'ניתוח'` and one key per label/reason.

### 7. Tests
- `tests/discardedMessages.test.ts`: `summarize` on hand-built rows: the spec's scenarios (counts, unknown cost `+`, reasons order, triggers order and most common reason, median/average, share of wait capped at 100%, weekly buckets, top clients order).
- `tests/removeFutureEmail` is DB-bound; the stamping query is covered by a query-level test only if a DB test harness exists, otherwise by the manual live check. `tests/clientDecline.test.ts` updates the `removeFutureEmail` dep signature.
- `tests/messageAnalytics.test.ts`: duration formatting and wait-curve tick labels.

## Risks / Trade-offs

- **Backfilled triggers are a guess from thread order**: an old draft that followed a verification or a tax fetch reads as `client_message` or `agent_message_sent`. Only drafts written after this change carry the exact trigger.
- **Backfilled discard times are approximate** (the next thread row, not the cancel). Labelled `unknown` reason so the admin can tell them apart.
- **A cycle that drafts nothing still spends**: its calls carry a cycle id but no draft, so that spend appears in neither "all drafts" nor "discarded". The tab says "cost of drafts", not "cost of planning".
- **`send_settled` stamps are rare**: after a real send the row is `sent` and the guard skips it; only the not-sent path (window closed, draft parked) leaves a `draft` row to stamp.
- **Timezone**: weeks are bucketed in the accountant timezone on the server, not the browser's; identical for Israel-based admins, documented in the tab's tooltip.
- **Migration on production**: 076 touches every outbound row once; `emails` is small (thousands of rows), the backfill is one statement per column.
