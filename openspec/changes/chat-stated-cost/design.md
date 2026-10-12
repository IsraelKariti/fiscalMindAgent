## Context

See proposal.md — Why. The pieces that shape the approach, as they are today:

- Every list decision of the planner rests on `{message_id, quote}` from a stored inbound message (`validateEvidence` in `decisionSchema.ts`: the message must be this client's, the quote verbatim). `resolution_evidence` on `client_documents` already stores such a ref for `not_required` and `retired` rows, and the documents card prints its quote (`DocumentsCard.tsx`, "הלקוח: "…"").
- Only a file closes an item: `collectFiles` (`apply_collections`) needs a real file, verification approves it (`approved`), `allSettled` in `plan.ts` counts `approved | not_required | retired`. A no-file claim lands as `claimed` and waits for the accountant.
- The cost declaration exists twice: as the `real_estate` paper `cost_declaration` (migration 060, `CatalogPaper`), and as a vehicle instance the planner names "הצהרת עלות - [הרכב]" by prompt convention (`prompt.md`, vehicle branch) — `vehicle` declares no papers, so code cannot tell that instance from the licence or the receipt.
- The decision schema is near the Anthropic union budget (`decisionSchema.ts`, "Response-schema pruning"): each nullable field costs one slot; whole groups are pruned per context (`prunedDecisionFields`) and nulls restored afterwards. `proven_by_file_id` is a plain string with `''` = none for this reason.
- `client_documents.status` is guarded by a CHECK constraint (last widened by migration 050).
- The workspace tabs are in-memory state in `ClientView.tsx` (`activeTab`, `selectTab`); the timeline (`Timeline.tsx`) renders one `<li>` per message keyed by `email.id` and auto-scrolls to the bottom unless the user scrolled up. The Documents tab and the Conversation tab share only the `ctx` object `ClientView` passes to each tab's `render`.

## Goals / Non-Goals

**Goals:**
- A client message closes a cost-declaration item in the same planning cycle in which the planner reads it, with no extra turn and no verification run.
- Code, not the model, decides that the item allows a statement and that the amount is really in the client's words.
- The accountant can get from the item to the exact message in two clicks.
- Vehicle items get papers so the statable item is identified by key, not by name.

**Non-Goals:**
- Replacing a stated cost with a later file automatically. If the client later sends the receipt, the accountant reopens the stated row (or the agent handles the file as an unmatched file, as today); no code path swaps a statement for a file.
- Stated values for anything but a purchase cost (no stated balances, no stated dates).
- Carrying the stated amount into the extraction record or the proven-facts line of `real_estate`. The amount lives on the row's evidence; the planner line reads it from there.
- Links from the step detail modal to the message. The modal keeps printing the quote as it does for every evidence ref.
- A WhatsApp-side marker on the message ("used as evidence"); the link goes one way, card → message.

## Decisions

**D1. The statable mark is a paper flag; `vehicle` gets papers.**
`CatalogPaper` gains `clientMayStateInChat?: true`. It is set on `cost_declaration` (`real_estate`) and on the new `vehicle_cost_declaration`. `VEHICLE_PAPERS` = `vehicle_license` (רישיון רכב; anatomy hint = the existing `analysisHintHe` of the type, moved to the paper), `vehicle_purchase_document` (מסמך רכישה / קבלה; hint: tax invoice / receipt / sale agreement naming the vehicle and the price; not a licence, not an insurance policy), `vehicle_cost_declaration` (הצהרת עלות; hint = the property one). The type-level `analysisHintHe` of `vehicle` stays for the classifier's type decision. A test in `tests/capitalCatalog.test.ts` asserts exactly two statable papers.
*Alternative:* recognise the vehicle cost declaration by its name prefix "הצהרת עלות" — rejected, item names are model output and the accountant can rename rows; migration 060 used a name prefix only for a one-time backfill, which this change repeats for vehicles (migration 062).
*Consequence:* `matched_paper_agrees` and the tie refusal now apply to vehicle files. The classifier must name the paper of a licence and a receipt; the two are visually distinct, and the risk is listed below.

**D2. The planner states a cost in two places, with non-nullable shapes.**
- `stated_costs: Array<{ document_id, amount: number, currency: string, evidence: { message_id, quote } }>` — top-level, non-nullable (always present, `[]` = none), for an existing pending item. Added to `INTAKE_FIELDS` so non-intake contexts prune it; `restorePrunedNulls` restores `[]` for it (the one array in the pruned set — the restore map gets a per-field default instead of a flat `null`).
- `stated_cost: { amount: number, currency: string, message_id: string, quote: string }` on every instance of `resolved_documents[].instances[]` and `added_instances[].instances[]`, non-nullable; `amount: 0` = none (the `proven_by_file_id: ''` precedent). The prompt says so in one sentence.
`currency` is a three-letter code; the prompt says ILS unless the client named another currency.
*Alternative:* nullable objects — rejected, three more nullable slots in the intake group would push intake contexts past the budget that broke production on 2026-09-01.
*Alternative:* only the top-level field, with the item created in one cycle and stated in the next — rejected, the client would be asked the price twice (see the "lost receipt and price in one message" scenario).

**D3. One validator, three checks, in `validate_message`.**
`validateStatedCosts(decision, ctx)` in `decisionSchema.ts` runs after `validateResolutions` / `validateAddedInstances` (so it sees the new instances' papers) and before the message normalisation. For each stated cost, in order: (1) `stated_cost_item_allows` — for an existing item: the item is in `ctx.intake.statableItems` (pending rows whose paper is statable, built by `buildDecisionContext`); for an instance: `getCatalogPaper(instance.paper_key)?.clientMayStateInChat`; (2) the evidence via `validateEvidence` (its throw is the existing `business_rules` failure); (3) `stated_cost_amount_in_quote` via `amountAppearsIn(amount, quote)`: strips `,` `.` and spaces between digit groups, then accepts the plain digits, or `N אלף` → N×1000 and `N מיליון` → N×1,000,000 with N allowed a decimal ("1.5 מיליון"). Hebrew number words are not parsed; the prompt tells the agent to ask for digits when the gate rejects for this reason (the correction suffix already feeds the rejection note back into the retry). `amount` must be > 0 (0 on an instance means none; 0 on `stated_costs` is a failure). `NormalizedDecision` carries `statedCosts: Array<{ documentId | instanceRef, amount, currency, evidence }>`.
*Alternative:* let the model parse words into a number and trust it — rejected, the amount goes into the tax declaration; it must be the client's own digits.

**D4. `stated` is a new status, set by a new step, settled like `approved`.**
Migration 062 widens the CHECK constraint with `stated` and backfills `vehicle` papers by name prefix. `DocumentStatus` gains `'stated'`; `ResolutionEvidence` gains `{ source: 'chat'; message_id; quote; amount: number; currency: string }`. `clientDocuments.markStated(clientId, [{id, evidence}])` writes status + `resolution_evidence` (only from `pending`; `CHECK` of the WHERE, like `markCollected`). `applyStatedCosts(run, decision, changes)` in `plan.ts` runs after `applyAdditions` (so instance refs resolve to the rows just created — `changes.created` already maps instance → row for `file_ids`) and before `collectFiles`; it records the step `apply_stated_costs` (`statedCostsStepDetail` in `applyStepDetails.ts`) and the audit action `document.stated` per row. `allSettled`, the `INTAKE STATUS` builder and `buildDocumentsSection` treat `stated` as settled; the line gets the extra `הוצהר בצ'אט: <amount> <currency>`. `answerTiesFiles` is unchanged: a statement alone is a `follow_up` with a message. The status update behind the accountant's "return to required" accepts `stated` and clears `resolution_evidence`, as it does for `not_required`.
*Alternative:* reuse `approved` with a `source: 'chat'` evidence — rejected, `approved` is documented as "never set by hand, the pipeline accepted a file", several readers assume a verification record, and the accountant should see at a glance that no paper exists.

**D5. The prompt keeps the paper-first order.**
`prompt.md`, vehicle branch: "אם הלקוח מוסר שאין בידיו מסמך רכישה או קבלה … במקומו נדרשת הצהרת עלות" stays, and continues: the client may state the price here in the chat; when the client has already written the price (in this message or an earlier one), fill `stated_cost` on the new instance with that quote and confirm the recorded amount in the reply; when the client wrote a price but has not yet said whether the receipt exists, ask once "האם מסמך הרכישה או הקבלה בידיך?" and state nothing yet; when the price is in words only, ask for digits. The real-estate second option: the signed page "או שהלקוח כותב כאן בצ'אט כמה שילם" with the same `stated_cost` / `stated_costs` rule; the ladder (contract → assessment + tabu → cost declaration + tabu) is unchanged. Action 1ב documents both fields and the `amount: 0` convention. The catalog `descriptionHe` of both types gains one clause: the cost declaration may be a signed page or the client's statement in the conversation.

**D6. The link from the card to the message.**
`ClientView` adds `focusMessage(messageId)` to the tab `ctx` (the tabs themselves are declared in `web/src/agents/declarationOfCapital.tsx`): it calls `selectTab('conversation')` and sets a `focusedMessageId` state the Conversation tab receives. `Timeline.tsx` gives each message `<li>` `id={`message-${email.id}`}` and, on a `focusedMessageId` change, `scrollIntoView({ block: 'center' })` on that element plus a `highlight` class for ~2 s (CSS keyframe in the app theme), then clears the state; the near-bottom check is left untouched by the programmatic scroll. The documents card renders the stated row's note as a `<button type="button" className="doc-evidence-link">` with the quote; disabled (plain text) when the row's evidence has no `message_id`. Stated rows get their own group after `approved` (`groupStated: 'הוצהר בצ'אט'`), and the progress count treats `stated` as done.
*Alternative:* a URL hash per message (`#/clients/<id>/messages/<mid>`) — rejected, tabs are not routed today and the step-link pattern is for admin modals, not for in-page scrolling.

**D7. Evals and tests.**
`generate_message` cases (design D5 behaviours), all vehicle, WhatsApp window open: (a) receipt item pending, inbound "אין לי את הקבלה, שילמתי 85,000 ש"ח" → expects `added_instances` vehicle 1 with `stated_cost.amount` 85000, `retired_documents` [receipt id], `message_includes_any: ["85,000", "85000"]`, `message_excludes: ["חתום", "דף"]`; (b) receipt pending, inbound "הרכב עלה 85,000" with no word about the receipt → `no_list_change`, `stated_costs` empty, `message_includes_any: ["קבלה", "מסמך רכישה"]`; (c) cost-declaration item pending, inbound "שילמתי 85,000" → `stated_costs` [{document_id, amount 85000}], `follow_up`; (d) property: `cost_declaration` item pending, inbound "לפי הערכתי שילמתי 1.2 מיליון" → `stated_costs` amount 1200000. `evals/stages.ts` gains the `stated_costs` check (document ids + amounts) and `new_instance_stated_amounts`. Unit tests: `tests/intakeDecision.test.ts` (each rejection of D3, the two accept paths, `amountAppearsIn` table incl. "85 אלף", "1.5 מיליון", "1,250,000", words → reject), `tests/capitalCatalog.test.ts` (two statable papers, vehicle paper keys unique), `tests/applyStepDetails.test.ts` (`statedCostsStepDetail`), `tests/collectDecision.test.ts` (a statement alone is not a collecting answer).

## Risks / Trade-offs

- [The classifier names the wrong vehicle paper and `matched_paper_agrees` drops a licence match] → the paper hints describe both papers; a dropped match leaves the file unattached and the planner asks the client, as for any unmatched file. Watch the first live vehicle files in `#/steps`.
- [The model states a price the client only implied] → the quote must contain the digits; the item must be pending and statable; the prompt forbids stating before the paper was declared missing. A wrong statement is visible on the card with the quote and reversible by "return to required".
- [Schema budget] → no new nullable field (D2). The request-schema tests (`tests/anthropicSchema.test.ts`) cover the intake context with the new fields.
- [Old vehicle rows without a paper] → the backfill covers the three conventional prefixes; a row it misses carries no paper and cannot be stated (the gate rejects, the agent asks for a signed page as today). The accountant can remove and let the agent re-add it.
- [Rollback after rows were stated] → the old CHECK constraint rejects `stated` only on write; the down path returns stated rows to pending first (Migration Plan).
- [The Documents tab and the Conversation tab are different components] → the only shared surface is `ctx`; `focusMessage` adds one callback and one state to `ClientView`, nothing global.

## Migration Plan

- Deploy code and migration 062 together (the worker runs migrations at startup in production; locally `npm run db:migrate`). The migration: (1) drop and re-add `client_documents_status_check` with `stated`; (2) backfill `paper_key` for `vehicle` rows by name prefix.
- No data is rewritten besides the vehicle `paper_key` backfill; `resolution_evidence` is JSON and needs no change.
- Rollback: `UPDATE client_documents SET status='pending', resolution_evidence=NULL WHERE status='stated'`, then revert the code; the constraint may stay widened.
- Notion: one sentence on the Real estate page and the vehicle page (Accounting), following `STYLE.md`.
