## Why

The agent exists to save the accountant the back-and-forth with the client and to gather as much as possible about the client's assets for a comprehensive declaration of capital. For a vehicle the declaration rests on the client's own statement: make, model, production year, plate and purchase cost. The vehicle licence and the purchase receipt are better evidence and the agent should strive for them, but the accountant confirmed (2026-10-18) that neither is mandatory — a client who cannot find the licence, who only has a licence that expired long before the declaration date (declaration 31.12.2025, licence expired 22.4.2022), or who has no receipt must still be able to finish. Today the licence is "חובה", an expired licence is rejected by the `not_expired` check, and a missing receipt can only be replaced by a cost stated as a number — so a vehicle with no usable paper blocks the whole declaration.

## What Changes

- **Goal-first vehicle rule.** The planner's objective per vehicle is the vehicle's facts (make, model, production year, plate, purchase cost) from the client's words; the licence and the receipt are the preferred ways to get them, requested together and presented as helpful, never pressed for. Lack of either is not a show stopper.
- **One client vehicle declaration per vehicle.** A new statable paper `vehicle_declaration` ("הצהרת הלקוח על הרכב") replaces the vehicle cost declaration `vehicle_cost_declaration`. When the client says they cannot send the licence or the receipt, the agent adds this item once per vehicle, records whatever the client wrote (any subset of the five facts — fields the client does not know stay empty), retires the missing paper's item, and moves on. The item is closed from the chat with a new planner tool `state_vehicle` (the sibling of `state_cost`, which stays for the property cost declaration only), and a later statement on the same vehicle adds fields to it.
- **Any licence is accepted.** The `not_expired` check is removed from the vehicle type (its only user) and from the gate list and trace; the "valid until" date is still read for the record. Every wording surface drops the validity condition and the word "חובה": catalog description and analysis hint, vehicle extraction prompt, planner vehicle block, questionnaire intake rule, item name "העתק רישיון רכב — [הרכב]".
- **Accountant view.** A stated vehicle declaration row shows the recorded facts and one clickable quote per client statement, in the stated row's existing place among the settled rows.
- **BREAKING (data)**: existing `vehicle_cost_declaration` rows are renamed to `vehicle_declaration` and their stated cost is carried into the new evidence shape (migration 066). The planner tool `state_cost` no longer accepts a vehicle item.
- The office reference page in Notion (Accounting → Vehicles) is updated to the same rule.

Out of scope: no change to the property cost declaration or the real-estate flow; no change to the file classifier beyond the renamed paper; no auto-retirement of papers when the client's statement covers everything (the agent still offers to receive a paper the client later finds).

## Capabilities

### New Capabilities

- `vehicle-declaration`: the client's own statement about a vehicle as a checklist item — when the agent creates it, which facts it carries, how the planner states and extends it from the chat, the checks the statement passes, how it settles the goal, and how the accountant sees it.

### Modified Capabilities

- `document-extraction`: the requirement "A vehicle licence is judged at the valuation date" is replaced by "A vehicle licence is helpful, not required" — no validity check, and the agent's wording presents the licence and the receipt as preferred, not mandatory.
- `code-gates`: the `not_expired` entry leaves the `verify_extraction` check list (no type carries a validity check any more); a new requirement lists the checks of a stated vehicle declaration.
- `document-papers`: the vehicle papers become `vehicle_license`, `vehicle_purchase_document` and `vehicle_declaration` (statable in chat); `vehicle_cost_declaration` is withdrawn.

## Impact

- `src/agents/declarationOfCapital/documentTypes/vehicle.ts` — verify list, prompt text (licence helpful; the declaration page as a paper).
- `src/agents/declarationOfCapital/verifyChecks.ts` — `notExpiredCheck` and its skip reason deleted.
- `src/agents/declarationOfCapital/catalog.ts` — vehicle `descriptionHe`, `analysisHintHe`, `VEHICLE_PAPERS` (new `vehicle_declaration`, old paper removed).
- `src/agents/declarationOfCapital/decisionTools.ts`, `decisionSchema.ts`, `plan.ts`, `applyStepDetails.ts` — tool `state_vehicle`, its validation (`validateStatedVehicles`), apply step `apply_vehicle_declarations`; `state_cost` restricted to `cost_declaration`.
- `src/db/types.ts`, `src/db/clientDocuments.ts`, `migrations/066_vehicle_declaration.sql` — new evidence shape, paper rename and evidence conversion.
- `src/agents/declarationOfCapital/prompt.md`, `prompt.ts` (`statedCostLine` → a vehicle line), `formIntakeCall.ts` — goal-first vehicle block, `retire_document` second case, intake item names.
- `web/src/components/DocumentsCard.tsx`, `web/src/i18n.tsx` — vehicle declaration note (facts + quotes); `not_expired` label removed.
- Tests: `tests/documentTypes.test.ts`, `tests/verifyChecks.test.ts`, `tests/fixtures/extractionCalls/vehicle.json`, `tests/capitalCatalog.test.ts`, `tests/collectDecision.test.ts`, `tests/intakeDecision.test.ts`, `tests/decisionTools.test.ts`, `tests/formIntake.test.ts`.
- Evals: `evals/cases/extract_document.json` ext_27/ext_28; `evals/cases/generate_message.json` dec_26–dec_31 re-targeted to the vehicle declaration; a new `stated_vehicles` expectation in `evals/stages.ts`; new cases for "cannot find the licence" and "no receipt, no idea of the price".
- Docs: `docs/agents.md` vehicle and chat-stated-cost paragraphs; `openspec/specs/chat-stated-cost` wording once that change is archived; Notion Accounting → Vehicles.
- Ordering: the change `chat-stated-cost` (migration 062, `state_cost`, vehicle papers) must be archived before this one; this change builds on its code, which is already on master.
