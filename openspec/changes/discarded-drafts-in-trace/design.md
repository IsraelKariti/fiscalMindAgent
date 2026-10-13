## Context

See proposal.md - Why.

Today's state, observed in the code:

- A re-plan runs `removeFutureEmail`, which drops the pending job and marks a review-pending draft `superseded`, but never deletes the row. So every old draft is still in the `emails` table as an unsent outbound row (`status` 'draft' or 'held').
- The admin conversation endpoint (`GET /api/admin/clients/:id/conversation`, `src/api/llmAdmin.ts`) already flags each such row `discarded: true`, and also flags the `send_reply` step and the `generate_message` call that produced it (a call whose cycle also applied state changes is kept).
- The workspace timeline (`web/src/components/Timeline.tsx`) builds its rows in `mergeTrace` from the workspace thread (sent/received only) plus the trace rows, and skips every row flagged `discarded`. The discarded drafts themselves are never in the workspace thread, so they are simply absent.
- The admin conversation viewer (`AgentConversationsCard`) already shows discarded drafts with a "טיוטה שנזנחה" badge.
- The trace is refetched whenever the thread or `nextScheduled` changes, so a regenerate (which replaces `nextScheduled`) refreshes it without new wiring.

## Goals / Non-Goals

**Goals:**
- Show discarded drafts, and the call / step rows that belong to them, in the workspace timeline under the existing toggles, with no server change.
- Keep the timeline byte-for-byte the same while the LLM calls toggle is off, and for accountants.

**Non-Goals:**
- No change to the admin conversation viewer, the review queue, or the endpoint.
- No way to restore or re-approve a discarded draft.
- No new toggle; discarded material rides on the existing LLM calls toggle (the user's request).

## Decisions

1. **The discarded flag hides a row only while the LLM calls toggle is off.** `mergeTrace` keeps `discarded` calls when `show.calls` is on, and keeps `discarded` steps only when `show.calls && show.steps`. Alternative: a third toggle "old drafts". Rejected: the user asked for the LLM calls toggle, and a third switch is more UI for an admin-only view.

2. **Discarded drafts become a third row kind of `mergeTrace`.** `mergeTrace` takes the trace's `messages` and, when `show.calls` is on, pushes a `{ kind: 'draft', at, message }` row for every message with `discarded === true`, timed at `createdAt`. `ROW_RANK` places it with messages (after the call and the step of the same instant) so the cycle reads call → send_reply → draft. Alternative: inject the drafts into the `emails` array before `mergeTrace`. Rejected: `visibleEmails` drives the message count and the `prev` subject logic, and discarded drafts must not touch either.

3. **Rendering: a muted bubble, not a scheduled bubble.** The row renders as `<li className="timeline-item outbound discarded">` with the channel badge rule of ordinary bubbles, the timestamp, the subject (email only) and body, and a neutral badge reusing `t.adminMsgStatusDiscarded`. It reuses `.bubble` with a new `.bubble-discarded` style (dashed border, lower opacity, like `.bubble-scheduled` but greyed). No buttons. The agent's `reasoning`, when present, shows in a muted line like the admin viewer does.

4. **Move `mergeTrace` into a plain `.ts` helper so it can be unit-tested.** `web/src/components/timelineRows.ts` exports `mergeTrace` and the row types; `tests/timelineRows.test.ts` runs under `npm test` like `tests/stepLink.test.ts` does. Alternative: leave it inside the `.tsx` and test only in the browser. Rejected: the toggle matrix (calls / steps / both / none) is exactly the kind of logic a small table test pins down.

5. **The message count and the "no messages yet" notice ignore discarded drafts.** Both keep reading `visibleEmails`, which never contains them.

## Risks / Trade-offs

- [A `held` draft of the live job could be mistaken for discarded] → the endpoint already excludes the live job's draft by id; the timeline trusts the flag and adds no second rule.
- [Old clients may carry many discarded drafts] → each is one muted bubble under an admin-only toggle that is off by default; no pagination needed.
- [A discarded draft of the *first* message (held kickoff draft regenerated) has `createdAt` before any sent message] → it sorts first, which is the true order.

## Migration Plan

Web-only change; deploys with the next build. No migration, no rollback steps beyond reverting the commit.
