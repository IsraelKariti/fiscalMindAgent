## 1. Precondition

- [x] 1.1 Archive the change `chat-stated-cost` (`/opsx:archive chat-stated-cost`, accept "Sync now") so its document-papers, code-gates, workspace-documents, conversation-trace and chat-stated-cost specs are the baseline. Verify: `openspec list --specs` shows `chat-stated-cost` and `openspec validate vehicle-license-optional` still passes.

## 2. Drop the validity check

- [x] 2.1 Remove `notExpiredCheck` from the vehicle type's verify list and delete the function, its `noValidUntil` skip reason and the header comment in `verifyChecks.ts`; update the vehicle module's doc comment. Verify: `npm run typecheck` passes and `grep -rn not_expired src` finds nothing.
- [x] 2.2 Replace the `not_expired` unit tests: in `tests/documentTypes.test.ts` assert that a licence with `valid_until: '2022-04-22'` passes and that the vehicle row's check list has no `not_expired`; delete the `not_expired` case in `tests/verifyChecks.test.ts`. Verify: `npm test` passes.
- [x] 2.3 Remove the `not_expired` label from `web/src/i18n.tsx`. Verify: `npm run typecheck` passes and `grep -rn not_expired web/src` finds nothing.

## 3. The vehicle declaration paper and its storage

- [x] 3.1 In `catalog.ts` replace `vehicle_cost_declaration` with `vehicle_declaration` ("הצהרת הלקוח על הרכב", `clientMayStateInChat: true`, analysis hint for a signed page naming the car and/or the price); add `paperStatedBy(paperKey)` → `'state_cost' | 'state_vehicle' | null`. Verify: `tests/capitalCatalog.test.ts` updated (papers list, statable set, `paperStatedBy`) and passing.
- [x] 3.2 Add migration `migrations/066_vehicle_declaration.sql`: `paper_key` 'vehicle_cost_declaration' → 'vehicle_declaration' and conversion of `resolution_evidence` `{source:'chat', amount, currency, message_id, quote}` on those rows into `{source:'chat_vehicle', statements:[{message_id, quote}], facts:{purchase_cost, currency}}`. Verify: `npm run db:migrate` on the local DB succeeds and a stated vehicle row (insert one in a scratch transaction) comes out in the new shape.
- [x] 3.3 Extend `ResolutionEvidence` in `src/db/types.ts` with the `chat_vehicle` shape and add `mergeStatedVehicle(id, clientId, statement, facts)` in `src/db/queries/clientDocuments.ts` (pending or stated row → stated; statements appended; facts overlaid, newer wins). Verify: a unit test with a fake pool, or `npm run typecheck` plus the integration check of task 6.3.

## 4. Planner: tool, gate, apply, prompt

- [x] 4.1 Add the `state_vehicle` tool in `decisionTools.ts` (document_id, instance_name, manufacturer, model, production_year, license_plate, purchase_cost, currency, evidence pair; "" / 0 = not stated) and assemble it into `stated_vehicles` / an instance's `stated_vehicle` in `decisionSchema.ts`. Verify: `tests/decisionTools.test.ts` covers assembly of an existing-item statement and a new-instance statement.
- [x] 4.2 Add `validateStatedVehicles` in `decisionSchema.ts` with the checks `stated_vehicle_item_allows` and `stated_vehicle_facts_in_quote` (numbers via `amountAppearsIn` / digits match, text via normalised substring), at least one fact, pending-or-stated target; restrict `validateStatedCosts` to `cost_declaration` with the note "a vehicle is stated with state_vehicle". Verify: new cases in `tests/intakeDecision.test.ts` for the three gate scenarios of the code-gates delta and for `state_cost` on a vehicle item; existing `doc-car-cost` fixtures moved to `vehicle_declaration`.
- [x] 4.3 Add `applyVehicleDeclarations` in `plan.ts` (apply step `apply_vehicle_declarations`, detail builder in `applyStepDetails.ts`, audit `document.stated` with facts) and its i18n label; keep `applyStatedCosts` for property costs. Verify: `tests/collectDecision.test.ts` (or a new plan test) shows the step recorded with item name and facts.
- [x] 4.4 Add `statedVehicleLine` in `prompt.ts` (facts by Hebrew label, "לא ידוע" for empty) next to `statedCostLine`, and tolerate an old-shape `vehicle_declaration` row. Verify: a unit test renders the line for a two-statement row.
- [x] 4.5 Rewrite the vehicle special case in `prompt.md` goal-first (facts from the client; licence + receipt asked together as helpful, never pressed; "cannot send" → declaration item once per vehicle + `state_vehicle` + `retire_document`; one plain question for unknown facts, "don't know" accepted; receipt branch moves from `state_cost` to `state_vehicle`; no validity wording); extend `retire_document` (action 1ב) and the `paper_key` list; rewrite the catalog `descriptionHe` / `analysisHintHe` and the vehicle extraction prompt in `documentTypes/vehicle.ts` the same way (keep anatomy, keep `valid_until` line) and refresh `tests/fixtures/extractionCalls/vehicle.json`. Verify: `tests/documentTypes.test.ts` fixture guard passes; `grep -n "חובה לכל רכב\|בתוקף ביום 31.12" src/agents/declarationOfCapital` finds nothing.
- [x] 4.6 Update the vehicle intake rule in `formIntakeCall.ts`: items "העתק רישיון רכב — [הרכב]" + "מסמך רכישה/קבלה — [הרכב]"; a paper the form says is missing → "הצהרת הלקוח על הרכב — [הרכב]" (`vehicle_declaration`) in its place. Verify: `tests/formIntake.test.ts` passes with the new names.

## 5. Accountant view

- [ ] 5.1 In `web/src/components/DocumentsCard.tsx` render a stated `vehicle_declaration` row's facts by name ("לא ידוע" for empty) and one clickable note per statement (reuse the message-scroll hook); keep the single-note rendering for `source: 'chat'`. Verify: `npm run typecheck` passes and a browser check on a local client with a two-statement row shows both notes opening their messages.

## 6. Evals and integration

- [x] 6.1 Update `evals/cases/extract_document.json` (ext_27 notes, ext_28 `passed: true`, no `failed_keys`) and the comments in `evals/make-files.ts` / `evals/stages.ts`. Verify: `npm run evals -- --stage extract_document --rejudge` shows ext_27 and ext_28 passing.
- [x] 6.2 Add the `stated_vehicles` expectation to `evals/stages.ts`, re-target dec_26–dec_31 in `evals/cases/generate_message.json` to the declaration item, and add cases (via the add-eval-case skill): licence lost + facts in one message; licence lost, no facts yet (one question, no validity words); no receipt and no idea of the price (item closed, no price question). Verify: the cases pass with the configured model; commit the run file per the evals regen memory.
- [ ] 6.3 Local end-to-end check with a paused test client: client says the licence is lost → declaration item stated, licence retired, card shows the facts; then "no receipt, about 85 אלף" → cost added to the same item. Verify: both apply steps in the trace and the goal completes with the stated item.

## 7. Docs and reference

- [x] 7.1 Update `docs/agents.md` (vehicle paragraph, chat-stated-cost paragraph, pipeline step list in `docs/pipeline.md` for `apply_vehicle_declarations`) and the archived `openspec/specs/chat-stated-cost/spec.md` wording so it names only `cost_declaration` and points to `vehicle-declaration`. Verify: `grep -rn vehicle_cost_declaration docs openspec/specs` finds nothing.
- [x] 7.2 Update the Notion Accounting → Vehicles page to the goal-first rule, following `STYLE.md`. Verify: the page says the declaration rests on the client's statement and the licence and receipt are preferred, not mandatory.
- [ ] 7.3 Run `npm run typecheck` and `npm test`, commit per the Git workflow, and archive this change.
