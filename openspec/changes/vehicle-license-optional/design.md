## Context

See proposal.md — Why. Today the vehicle row is paper-driven: two items per vehicle (licence "חובה", receipt), the receipt may be swapped for a cost declaration (`vehicle_cost_declaration`) that the planner closes from the chat with `state_cost` (status `stated`, evidence `{source:'chat', message_id, quote, amount, currency}` on `resolution_evidence`, apply step `apply_stated_costs`, migration 062). The licence has no fallback and the `vehicle` type runs `notExpiredCheck` (its only caller). The real-estate row already follows a goal-first rule in `prompt.md` ("המטרה לכל נכס היא אחת"); the vehicle block does not.

The change `chat-stated-cost` is on master but not archived; its deltas (document-papers, code-gates, workspace-documents, conversation-trace, the new `chat-stated-cost` capability) are the baseline this change builds on, so it must be archived first.

## Goals / Non-Goals

**Goals:**
- Per vehicle, the planner pursues facts (make, model, year, plate, cost) from the client; papers are preferred evidence, never blockers.
- One self-declaration item per vehicle, stated and extended from the chat, settles whatever the papers do not.
- Any licence passes; the gate list and the trace lose `not_expired`.
- Every wording surface (catalog, hints, extraction prompt, planner prompt, intake rule, docs, Notion) says the same thing.

**Non-Goals:**
- No change to the property cost declaration, `state_cost` for `cost_declaration`, or the real-estate ladder.
- No auto-retirement of pending paper items when the declaration covers everything.
- No chat statements for any other type.

## Decisions

1. **One `vehicle_declaration` paper replaces `vehicle_cost_declaration`, instead of adding a second statable paper for the details.**
   Two self-declaration items per vehicle ("cost declaration" and "details declaration") would double the ladder, the summary lines and the UI rows for the same source — the client's words. One item carries all five facts, each optional. Alternative: keep `vehicle_cost_declaration` and add `vehicle_details_declaration` — rejected (duplication, two tools with overlapping evidence). The rename costs one migration (066): `paper_key` update and evidence conversion for existing rows (`{source:'chat', amount, currency, ...}` → the new shape with `purchase_cost`/`currency` in `facts` and the single statement in `statements`).

2. **A dedicated planner tool `state_vehicle`, not an extension of `state_cost`.**
   `state_cost` is amount-shaped and shared with real estate; mixing optional vehicle fields into it would widen the Anthropic schema (null-union budget, see memory on `null→enum`) for every client. `state_vehicle` takes `document_id | instance_name` (same addressing as `state_cost`), five optional facts as flat non-nullable fields with "" / 0 meaning "not stated" (same convention as `stated_cost.amount: 0`), `currency`, and the evidence pair. `state_cost` keeps accepting only `cost_declaration`; `paperMayBeStatedInChat` stays the catalog flag, and a new `paperStatedBy(paperKey)` → `'state_cost' | 'state_vehicle'` picks the tool in the gate so each tool rejects the other's paper with a clear note.

3. **Evidence shape: a list of statements plus merged facts.**
   `ResolutionEvidence` gains `{ source: 'chat_vehicle'; statements: Array<{ message_id; quote }>; facts: { manufacturer?; model?; production_year?; license_plate?; purchase_cost?; currency? } }`. `markStated` today requires `status = 'pending'`; a sibling `mergeStatedVehicle(id, clientId, statement, facts)` updates a pending or stated row, appends the statement and overlays the facts (newer wins). The planner line (`statedVehicleLine` beside `statedCostLine`) lists facts by Hebrew label with "לא ידוע" for empty ones so the model never re-asks a recorded fact and knows it may still fill an empty one. The card note renders one clickable quote per statement using the existing message-scroll hook.

4. **Facts must be in the quote, like the cost amount.**
   `validateStatedVehicles` mirrors `validateStatedCosts`: `stated_vehicle_item_allows` (paper `vehicle_declaration`, status pending or stated, or a new instance of that paper) and `stated_vehicle_facts_in_quote` (numbers via the existing `amountAppearsIn` for the cost and a digits match for year and plate; text via a normalised substring match — Hebrew/Latin, spaces and quotes collapsed). This keeps the audit property that every recorded fact is visible in a client message. Alternative: trust the model's extraction of make/model — rejected, it breaks the "verbatim evidence" invariant the gates rely on.

5. **Ladder in the planner prompt (goal-first, like real estate).**
   The vehicle block opens with the goal sentence, then: licence + receipt asked together as helpful; "cannot send the licence" → `add_instance` of the declaration (once per vehicle, reuse if present) + `state_vehicle` with whatever facts are in the client's words + `retire_document` of the licence; if no facts yet, one plain question for what the client knows, "don't know" accepted; "cannot send the receipt" → same item, cost stated (estimate fine; none at all is fine too — the item still closes). The existing "price before the paper question" rule of `chat-stated-cost` keeps applying (ask once whether the receipt exists). `retire_document` (action 1ב) gets the second case explicitly. The intake rule creates the declaration item in place of a paper the form says is missing (pending; the planner states later).

6. **Delete `notExpiredCheck`.** Only caller is `vehicle`; the spec rule is "a check absent from a type is not reported, not even skipped". The function, `SKIP_REASONS_HE.noValidUntil`, the `not_expired` i18n label and both unit tests go. `valid_until` stays in the common schema.

7. **Trace and audit.** New apply step `apply_vehicle_declarations` (detail: item name, facts recorded, statement count) with its own i18n label; audit action stays `document.stated` with the facts in `detail`. The `apply_stated_costs` step is unchanged for property costs.

8. **Evals.** `extract_document`: ext_27 keeps passing (notes drop `not_expired`), ext_28 → `passed: true`. `generate_message`: dec_26–dec_31 move from `הצהרת עלות`/`vehicle_cost_declaration`/`stated_costs` to the declaration item and a new `stated_vehicles` expectation (`evals/stages.ts`: row id or new instance name → facts); add cases for "cannot find the licence + facts in one message", "cannot find the licence, no facts yet" (expects one question, `question_excludes` nothing about validity), "no receipt and no idea of the price" (item closed, no price question).

## Risks / Trade-offs

- [Planner retires the licence on "I'll look for it later"] → the prompt rule requires the client to say they cannot or will not send it; "later" stays pending. Eval case pins one clear phrasing; the gate still needs a verbatim quote.
- [Text facts fail the quote match on spelling variants (e.g. "מזדה" vs "מאזדה")] → the match is on the quote's own spelling; the rule tells the planner to copy the client's spelling. Failure note names the fact so the model fixes the value, not the client.
- [Two-change coupling with `chat-stated-cost`] → archive `chat-stated-cost` first; this change's document-papers delta is written against that archived text. If archived in the other order the MODIFIED block must be re-based.
- [Accountant gets a vehicle with empty facts] → accepted by the accountant (2026-10-18); the card shows "לא ידוע" per fact so the gap is visible, and the row can be returned to pending.
- [Old `source:'chat'` vehicle rows after migration] → 066 converts them; code also tolerates a `vehicle_declaration` row with the old shape by reading `amount`/`currency` as the cost (defensive, no second migration).

## Migration Plan

1. Merge code + migration 066 together; run `npm run db:migrate` locally, production runs it on deploy (after 062, which prod still needs).
2. Rollback: revert the commit; 066 is forward-only (paper rename), so a rollback also needs the reverse `UPDATE` by hand — acceptable, there are no real clients.

## Open Questions

None that change the specs. Wording of the declaration item name ("הצהרת הלקוח על הרכב") and the Hebrew fact labels can be tuned during apply.
