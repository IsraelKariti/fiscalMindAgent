## Context

The timeline notice is chosen by one pure function, `resolveTurnActivity` (`web/src/components/turnActivity.ts`). Today it returns `'failed'` whenever `draft_failed_at` is set, before it looks at `paused`; the paused/handed-off bubble in `Timeline.tsx` renders only when the activity is `null`. The overdue scan (`overdueScan.ts`) and the decline flow pause the client and stamp `agent_fields.overdue_stopped_at` / `declined_at` but do not clear `draft_failed_at`, so a stale failure outranks the hand-off. The workspace client read already serializes `overdue_stopped` and `declined` (`web/src/api.ts`).

## Goals / Non-Goals

**Goals:**
- A handed-off paused client always shows its handed-off notice.

**Non-Goals:**
- Clearing `draft_failed_at` server-side at hand-off time. The failure stamp stays as a fact; it is simply not shown while the client is handed off. Resume re-plans as today (the planner bookkeeping replaces the stamp).
- Any change to the held first-message path (a paused never-contacted client with a draft or a failed draft keeps showing drafting/failed with Retry).

## Decisions

- **Decide in the resolver, not in the JSX.** Add `handedOff: boolean` (overdue stopped or declined) to `TurnActivityInput.client`; when `paused && handedOff` the resolver returns `null` before the held/failed/drafting checks. Rationale: the resolver is the single, tested place for notice precedence, and `Timeline.tsx` already renders the right handed-off copy when the activity is `null`.
  Alternative: hide the failed bubble in `Timeline.tsx` when `overdueStopped || declined`. Rejected: the resolver would still report `'failed'` (used for the `busy` flag) while the page shows something else.
- **Hand-off wins over "held".** A handed-off client that is also outage-held shows the handed-off notice. The agent is stopped either way, and the hand-off is the cause the accountant must act on.

## Risks / Trade-offs

- [A handed-off client with a fresh `drafting_since` (planner killed mid-run by the overdue pause)] → the hand-off wins; Resume re-plans, so nothing is lost.
- [Held first-message exception] → `handedOff` is false for a never-contacted client (no due date yet, no decline), so the existing exception is untouched. A unit test guards it.
