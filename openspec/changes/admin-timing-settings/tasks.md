## 1. Settings module

- [x] 1.1 Create `src/orchestration/timingSettings.ts`: keys `message_timing:quiet_seconds`, `message_timing:max_wait_seconds`, `message_timing:after_send_delay_seconds`; `getMessageTiming()` resolves saved → env → code default per value; `saveMessageTiming(next)` validates (integers; quiet ≥ 1; max wait ≥ quiet; after-send ≥ 0) and upserts, throwing a `MessageTimingError` with a plain message on a cross-field violation. Pure resolver/validator functions are exported for tests. Verify with a new `tests/timingSettings.test.ts` (fallback order, invalid rows ignored, each validation rule).

## 2. Read the values per decision

- [x] 2.1 `src/orchestration/inboundTurnCore.ts`: `createReplanRequester` takes `quietMs: () => Promise<number>`; `createAfterSendReplanRequester` takes `delayMs: () => Promise<number>` (the explicit `delayMs` argument of the recovery call stays). Update `tests/inboundTurn.test.ts` to pass async providers; the suite passes.
- [x] 2.2 `src/orchestration/requestReplan.ts`: wire both providers to `getMessageTiming()`. `src/queue/replanWorker.ts`: `onReplan` and `recoverLostReplans` read `getMessageTiming()` once per run for `limits` and the after-send delay. `src/orchestration/inboundTurn.ts`: turn-store TTL becomes 24 h (comment why). Verify with `npm run typecheck` and `npm test`.
- [ ] 2.3 (code done; analytics-tab check left to the owner) `src/api/messageAnalyticsAdmin.ts`: `currentQuietSeconds` from `getMessageTiming()`. Verify by loading the analytics tab after saving a new quiet window: the "now" marker moves.

## 3. Admin API and page

- [x] 3.1 (code done; curl check left to the owner — Docker/Postgres was down in the apply session) `src/api/admin.ts` + `src/api/router.ts`: GET/PUT `/api/admin/message-timing` (admin only) returning `{ quietSeconds, maxWaitSeconds, afterSendDelaySeconds }`; PUT validates with zod, maps `MessageTimingError` to 400 `{ error }`. Verify with curl as admin: GET shows the env values before any save; PUT with max wait < quiet returns 400 with the message; PUT valid returns the saved values.
- [x] 3.2 (code done; browser check left to the owner) `web/src/api.ts`: `adminGetMessageTiming` / `adminSetMessageTiming`. `web/src/i18n.tsx`: title, description (what each wait does, note that a very short quiet window means more planner calls), three labels, saved/load-failed/save-failed texts. `web/src/components/admin/AdminSettings.tsx`: a "message timing" section after the budget section, same layout (three numeric inputs, one Save, banners), a refused save shows the server message and resets the inputs to the saved values. Verify in the browser on `#/settings`: values load, a save succeeds, the invalid combination shows the error.
- [ ] 3.3 (live check, owner) End to end: save a quiet window of 30 s locally, send a WhatsApp message (or the local mock) to a test client, and confirm in the worker log that the replan job fires ~30 s after the message without a restart.

## 4. Docs

- [x] 4.1 `.env.example`: say the three variables are defaults that the admin settings page can override. `docs/pipeline.md`: the quiet-window, max-wait and after-send rows name `timingSettings.ts · getMessageTiming` as the source of the value. Verify by reading both.
- [x] 4.2 `npm run typecheck`, `npm test`, then commit per the repo Git workflow.
