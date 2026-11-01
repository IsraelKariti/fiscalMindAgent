## Context

- Templates are rows of `wa_templates` seeded by migrations (051 intro, 064 reopen); there is no admin UI, only the `waAdmin` routes. `splitTemplatesByPurpose` offers the planner `intro` rows until `emails.hasDeliveredOutbound`, `reopen` rows after. The prompt's first-contact rule (prompt.md ~line 117) tells the model to pick the intro template and fill its variables.
- The v2 template was created by the owner in the Twilio Content Template Builder (shared dev/prod account) on 2026-11-01: content type quick-reply, Hebrew, Utility, SID `HX9bcbb5536239a542c74a772f4a0e70d3`, buttons "נתחיל כאן בוואטסאפ" (id `start`) and "לא, אטפל בזה בעצמי" (id `decline`). A quick-reply tap reaches the inbound webhook as a normal message: `Body` = the button text, plus `ButtonText` and `ButtonPayload` (= the button id). The webhook already parses `Body` and ignores the rest.
- The "stop and hand off" mechanics already exist for the collection window (`overdueScan.ts`): `clients.markOverdueStopped` (paused + `overdue_notified_at`/`overdue_stopped_at` markers), `pauseFutureEmail`, `sendOverdueEmail` (`notifyAccountant.ts`, trace row `email.accountant_sent`), UI `isOverdueStopped` (badge, tiles, overview dot, dashboard count), and resume / due-date routes that clear the marker.
- A fixed code-authored WhatsApp text has a precedent: `closingMessage.ts` + `sendClosingMessage` (trace step `send_closing`, open window only, never a template).
- The webhook's `OPT_OUT_KEYWORDS` (exact-match "לא מעוניין" etc.) disables the WhatsApp channel silently; it is a channel kill, not a hand-off, and stays as is.
- Planner answers are flat tool calls (`decisionTools.ts`), assembled and gated in `decisionSchema.ts`; `conclude.decision` is one of `goal_complete | follow_up | collect`.

## Goals / Non-Goals

**Goals:**
- Swap the intro template in place, in every database, with no manual registration.
- Handle a decline deterministically for the button and through the planner for words, with one shared hand-off routine.
- Reuse the overdue hand-off shape (pause + marker + email + resume) so the workspace needs wording, not new mechanics.

**Non-Goals:**
- Changing `OPT_OUT_KEYWORDS` or the channel-disable behaviour.
- Storing button definitions on `wa_templates` or rendering buttons in the timeline (the bubble shows the body only).
- A decline path for the reopen template or for email clients.
- Telling monday about the decline.

## Decisions

1. **Migration 071 inserts v2 and deletes the old intro.** `INSERT ... ON CONFLICT (content_sid) DO NOTHING` for `capital_declaration_intro_v2` (`agent_type = 'declaration_of_capital'`, `purpose = 'intro'`, `variable_count = 3`, body verbatim) then `DELETE FROM wa_templates WHERE content_sid = 'HX468694984e38857766a4648638bcd868'`. Migration 051's insert uses `DO NOTHING`, so the old row never comes back. Alternative: keep the old row with a new purpose `retired`; rejected, it adds an enum value and prompt text for a row nobody should see. Alternative: register through `POST /api/admin/wa-templates` by hand in each environment; rejected, the SID is shared by dev and prod and the earlier changes seed too.

2. **Body stored verbatim, buttons documented in the migration comment.** The body column is "the text as approved by Meta"; the rendered body is what the timeline shows. The buttons are not part of the body. Trade-off: the accountant sees the client's reply "לא, אטפל בזה בעצמי" without seeing the button; acceptable, the wording explains itself.

3. **Button tap handled in code, typed refusal by the planner, one routine for both.** New module `src/agents/declarationOfCapital/clientDecline.ts`:
   - `isDeclineButton(evt)`: `buttonPayload === 'decline'` or trimmed body equal to the decline button text (constant `DECLINE_BUTTON_TEXT`). Pure.
   - `declineAckText(client, accountant)`: the fixed acknowledgement, built like `closingMessageText` (first name, `accountantDisplayName`). Pure.
   - `handleClientDecline(ctx, source: 'button' | 'planner')`: inside the client lock: `clients.markDeclined` (conditional update, returns null when already declined or not pending → return, nothing else), `pauseFutureEmail`, send the ack (same delivery check as `closingMessageDelivery`; trace step `send_decline_ack` with the skip reason when not sent), `sendDeclinedEmail(client, missing)` (missing = pending/unresolved documents, as the overdue email), `publishClientUpdated`.
   Why not planner-only: the button is deterministic and the incident history (prod 2026-10-15) shows the model follows whatever list it is given; a tap must never turn into a reminder. Why not code-only: clients type, and a typed refusal needs reading.

4. **The webhook passes the button payload to the agent hook.** `InboundEvent` gains `buttonPayload: string | null` (from `params.ButtonPayload`); `onInboundWhatsApp` reads it, nothing else changes there. In `index.ts` `onInboundMessage`: after the OTP shortcut and the injection screen, `if (isDeclineButton(evt)) { await handleClientDecline(ctx, 'button'); return; }` — no `requestReplan`, so no planner call. Alternative: a new agent-definition hook; rejected, the existing hook is the right junction (one named function per step, docs/pipeline.md).

5. **Planner: `client_declined` as a conclude decision value, no payload.** `DECISION_VALUES` gains `'client_declined'` (also in `AFTER_VERIFICATION_DECISION_VALUES`). The gate requires: no `send_*` call, no tie/mark/add calls alongside it (business_rules note otherwise). `plan.ts` handles it like `goal_complete` ends a cycle: calls `handleClientDecline(ctx, 'planner')` and returns without scheduling. Prompt gets one rule under the decision values: a clear refusal of the WhatsApp collection (the decline button's words, or an explicit "I will bring the documents to the office / I don't want this") → `client_declined` only; hesitation, "not now", or a question is never a decline. Alternative: a `client_declined` tool with a `reply` the model writes; rejected, the fixed text needs no review and keeps the model from arguing.

6. **Markers: `declined_at` in `agent_fields`, cleared like the overdue marker.** `clients.markDeclined(id)`: `paused = true`, `agent_fields || {declined_at}` where `deleted_at IS NULL AND goal_status = 'pending' AND declined_at IS NULL`. Resume (`workspace.ts` paused route) and due-date set (`router.ts`) drop `declined_at` next to `overdue_stopped_at`. No idempotency stamp survives resume on purpose: a second decline after a resume is a new event and emails again (spec). Alternative: a new column; rejected, the overdue markers live in `agent_fields` and the UI already reads them from there.

7. **UI: a sibling of `isOverdueStopped`.** `isDeclined(client)` = pending + `declined_at`. `ClientHeader` badge: declined wording wins over overdue; `StatTiles`/`Overview` get `handedOff = overdueStopped || declined`; dashboard SQL counts `agent_fields ? 'overdue_stopped_at' OR agent_fields ? 'declined_at'`. Hebrew strings in the i18n file: badge "הלקוח סירב — התיק בטיפולך", tile note "הלקוח ביקש להעביר את המסמכים למשרד בעצמו".

8. **Email kind `declined`.** `AccountantEmailKind` gains `'declined'`; `sendDeclinedEmail(client, missing)`: subject "הלקוח <name> סירב לאיסוף בוואטסאפ — יעביר את המסמכים למשרד בעצמו", body lists the missing documents and says the agent stopped and the client can be resumed from the file.

9. **Evals.** `evals/stages.ts` fixture intro template renamed to the v2 body (buttons noted in the fixture name only); new planner case: thread with the v2 intro delivered and the client's typed refusal, expects `decision: client_declined` and no message; a second case with "לא עכשיו" expects `follow_up`.

## Risks / Trade-offs

- [Deploy before Meta approves the v2 template] → every first contact fails at Twilio (drafting failed, manual retry). Deploy only after the Twilio console shows "Approved" (Migration Plan step 1).
- [Meta rejects the template text] → reword and resubmit in Twilio; the new SID replaces the one in migration 071 before it ships, or a follow-up migration if it already did.
- [`ButtonPayload` field name differs from the assumption] → the text-equality fallback still catches the tap (the body is the button text); verify the real webhook fields on the first live tap and log them.
- [A client types the button text as a free message with a different intent] → impossible to tell apart; treated as a decline, the accountant can resume.
- [The planner over-uses `client_declined`] → the prompt rule names the non-cases; the eval case guards "לא עכשיו".
- [Old clients in prod whose intro was the old template] → unaffected: `hasDeliveredOutbound` hides every intro for them.

## Migration Plan

1. Owner: wait until the Twilio console shows `capital_declaration_intro_v2` as "Approved" for WhatsApp.
2. Run migration 071 locally (`npm run db:migrate`); production runs it on deploy (prod also still needs 062–070).
3. Deploy. Rollback: revert the code; re-insert the old intro row by hand (`POST /api/admin/wa-templates`, SID `HX468694984e38857766a4648638bcd868`, purpose `intro`) and delete the v2 row.
