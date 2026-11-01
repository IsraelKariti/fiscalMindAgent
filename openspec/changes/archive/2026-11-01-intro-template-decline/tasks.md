## 1. Template swap

- [x] 1.1 Add `migrations/071_intro_template_v2.sql`: insert `capital_declaration_intro_v2` (SID `HX9bcbb5536239a542c74a772f4a0e70d3`, body verbatim from the Twilio template, `variable_count` 3, `agent_type` declaration_of_capital, `purpose` intro, buttons in the comment) and delete the old intro row; verify with `npm run db:migrate` then `GET /api/admin/wa-templates` lists v2 as `intro` and not the old one.
- [x] 1.2 Rename the intro fixture in `evals/stages.ts` to the v2 body and verify `npm run typecheck` and the existing planner cases still pass (`npm run evals -- --judge-only` or the harness's re-judge).

## 2. Decline recognition and hand-off routine

- [x] 2.1 Add `buttonPayload` to `InboundEvent` (`src/agents/types.ts`) and fill it from `ButtonPayload` in `src/webhook/onInboundWhatsApp.ts`; verify with the webhook unit test sending a payload.
- [x] 2.2 Create `src/agents/declarationOfCapital/clientDecline.ts` with `DECLINE_BUTTON_TEXT`, `isDeclineButton`, `declineAckText`, `handleClientDecline`; verify unit tests: payload match, exact text match, non-match, ack text with and without a first name.
- [x] 2.3 Add `clients.markDeclined` (conditional, returns null when not pending / already declined) and drop `declined_at` wherever `overdue_stopped_at` is dropped (`setDueDate`, `clearOverdueStopped` → a shared `clearHandedOff`); verify with a db test that a second mark returns null and resume clears the marker.
- [x] 2.4 Add `sendDeclinedEmail` and the `declined` kind in `notifyAccountant.ts` / `notifyAccountantCore.ts`; verify the trace row `email.accountant_sent` carries `kind: declined` in a unit test with a stub sender.
- [x] 2.5 Wire the button path in `index.ts` `onInboundMessage` (after OTP and injection screen, before `requestReplan`) and verify with a test that a decline tap pauses the client, records `send_decline_ack`, emails once, and runs no planner.

## 3. Planner path

- [x] 3.1 Add `client_declined` to `DECISION_VALUES` and `AFTER_VERIFICATION_DECISION_VALUES`; gate rejects it together with any `send_*`, `tie_file`, `mark_collected`, `add_instance` call (business_rules note); verify with decisionSchema unit tests.
- [x] 3.2 Handle `client_declined` in `plan.ts` (call `handleClientDecline(ctx, 'planner')`, no scheduling) and verify with a plan test that no send is queued and the client is paused.
- [x] 3.3 Add the decline rule to `prompt.md` (what is a decline, what is not, answer `client_declined` only) and verify the prompt fixture tests still pass.
- [x] 3.4 Add two planner eval cases (typed refusal → `client_declined`; "לא עכשיו" → `follow_up`) and run the planner stage with the configured models (`/run-evals`); verify both pass.

## 4. Workspace

- [x] 4.1 Add `isDeclined` in `web/src/format.ts`, the badge wording in `ClientHeader.tsx`, the handed-off styling in `StatTiles.tsx` and `Overview.tsx`, and the i18n strings; verify in the browser on a local client with `declined_at` set that the badge reads "הלקוח סירב" and the overview dot is the handed-off one.
- [x] 4.2 Count declined clients in the dashboard's handed-off number (`src/db/queries/dashboard.ts`) and clear `declined_at` on resume (`workspace.ts`) and on due-date set (`router.ts`); verify resume shows the client as in progress again.

## 5. Docs and verification

- [x] 5.1 Update `docs/agents.md` (template prerequisite names v2, decline flow) and `docs/pipeline.md` (new junctions: `isDeclineButton`, `handleClientDecline`, `send_decline_ack`); verify the named functions exist.
- [ ] 5.2 Owner: confirm the Twilio console shows the v2 template "Approved"; then live check on the local stack: kick off a test client, tap "לא, אטפל בזה בעצמי" on the phone, verify the ack arrives, the client shows declined, the accountant email arrives, and no planner call was recorded.
- [ ] 5.3 Commit and push per the Git workflow; production deploy after 5.2 (prod needs migrations 062–071).
