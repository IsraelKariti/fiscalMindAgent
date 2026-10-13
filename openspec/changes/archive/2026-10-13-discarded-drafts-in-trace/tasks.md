## 1. Row merging

- [x] 1.1 Move `mergeTrace`, `TraceEntry`, `TimelineRow` and `ROW_RANK` out of `web/src/components/Timeline.tsx` into `web/src/components/timelineRows.ts`, add a `draft` row kind built from the trace's discarded messages (timed at `createdAt`, ranked with messages), and keep discarded calls when `show.calls` is on and discarded steps only when `show.calls && show.steps`; verify `npm run typecheck` and `npm run build:gui` pass
- [x] 1.2 Add `tests/timelineRows.test.ts` to the `npm test` list covering the toggle matrix (calls off → no discarded row at all; calls on → draft + its call, no step; both on → draft + call + step; steps only → nothing discarded) and the ordering call → send_reply → draft at the same instant; verify `npm test` passes

## 2. Rendering

- [x] 2.1 Render the `draft` row in `Timeline.tsx` as a muted outbound bubble (channel badge rule as other bubbles, timestamp, subject for email, body, `t.adminMsgStatusDiscarded` badge, muted reasoning line when present) with no buttons, and verify the message count and the "no messages yet" notice still read `visibleEmails` only
- [x] 2.2 Add `.bubble-discarded` / `.timeline-item.discarded` styles in `web/src/styles.css` (greyed, dashed border, like the scheduled bubble but clearly old) and verify in the browser that a discarded bubble is visibly different from the live scheduled bubble

## 3. Browser check

- [x] 3.1 Under impersonation with the LLM calls toggle on, press "regenerate" on a scheduled draft and verify the old draft stays as a discarded bubble with its `generate_message` call row before it, the new draft shows as the scheduled bubble, and the count header is unchanged
- [x] 3.2 Turn the LLM calls toggle off and verify the timeline matches today's view (no discarded rows); turn only code steps on and verify the discarded `send_reply` step stays hidden; turn both on and verify it shows
- [ ] 3.3 Open the same client as the accountant (no impersonation) and verify no discarded draft shows; open the admin conversation viewer and verify it is unchanged

## 4. Docs

- [x] 4.1 Note the discarded-draft rows in `docs/agents.md` where the conversation trace is described, and verify `npm run typecheck` still passes before committing per the Git workflow
