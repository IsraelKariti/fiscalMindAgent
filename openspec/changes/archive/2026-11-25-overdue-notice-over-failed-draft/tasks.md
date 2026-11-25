## 1. Resolver

- [x] 1.1 Add `handedOff` to `TurnActivityInput.client` in `web/src/components/turnActivity.ts` and return `null` when the client is paused and handed off, before the held/failed/drafting checks; update the doc comment. Verify with `npm run typecheck`.
- [x] 1.2 Pass `handedOff: isOverdueStopped(client) || isDeclined(client)` from `web/src/components/ClientView.tsx`. Verify with `npm run typecheck`.

## 2. Tests

- [x] 2.1 In `tests/turnActivity.test.ts` add cases: paused + handedOff + draft_failed_at → null; paused + handedOff + stale drafting_since → null; paused + handedOff + outage_held_at → null; paused + not handedOff + draft_failed_at → 'failed' (held first-message path unchanged). Verify with `npm test`.

## 3. Check

- [ ] 3.1 Browser check on a local client: set draft_failed_at and the handed-off markers (passed due date + overdue scan, or set by hand); the timeline shows the due-date-passed notice with Resume and no Retry; Resume shows the drafting notice.
