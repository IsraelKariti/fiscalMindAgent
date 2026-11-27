## Why

The planner's real-estate rule is a list of steps ("first find out whether the property was bought second hand or from a builder"), not a goal. So when a client sends a purchase contract that is approved, names private sellers and states the price, the agent still asks "second hand or from a builder, and was it in a previous declaration?" (call `1cf945e3`, client ניב, 2026-10-09). The question exists only to decide which papers to ask for, and the approved contract already answers it. Nothing in the prompt says what the papers are for, so the agent cannot see that the goal is already met; and the rule "a file alone never changes the list" forbids it to use what the contract shows.

## What Changes

- **A goal, then the accepted proofs.** The planner's real-estate rule and the catalog description state the goal first: for every property, proof of ownership and proof of the purchase cost (a nominal cost for inheritance and gift). The accepted proofs per route (second hand, builder, not delivered, inheritance, gift, prior declaration by our office, the second option, the cost declaration) stay as today. The "ask this first" ordering is removed: the agent asks about the route only when no approved paper settles it and the answer still decides which paper to ask for.
- **The extraction reads the facts a property paper proves.** `real_estate` declares typed extraction fields: property address, purchase price and currency, purchase year, and the kind of seller (a private person, or a builder / company). All optional, because a tabu extract has no price and an inheritance order has no seller.
- **An approved paper's proven facts close the questions it answers.** For an approved `real_estate` item, the planner's document list line and the VERIFICATION RESULTS line carry the facts the approved file proved: ownership (the owner names), the purchase cost, the seller kind, the address. The prompt rule: never ask the client a fact an approved paper proves; a private seller means second hand, a builder seller means from a builder. Unverified file analysis still settles nothing (unchanged).
- **The list change that follows from a proven fact needs no client quote.** `validate_message` accepts, on an `added_instances` or `retired_documents` entry of a `real_estate` row, a reference to an approved file in place of the client quote, and only for the two consequences a proven seller kind implies: retire a payments appendix (or builder report) item when the seller was private; add the payments appendix item when the seller was a builder. Every other list change keeps the quote rule.
- **Evals.** The real-estate extraction cases expect the new fields (contract: price 320,000 USD, private seller; tabu: no price, no seller). One planner case replays the call above: contract approved this turn, tabu unmatched → the reply confirms the contract, asks only about the tabu, asks nothing about second hand or builder, changes no list item.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `document-papers`: adds the goal of a property's papers and the rule that an approved paper's proven facts close the clarification and show on the list line. Builds on the pending change `real-estate-second-hand-contract-only` (its "the planner SHALL ask which of the two it was" sentence now applies only when no approved paper settles the route).
- `document-extraction`: modifies "First set of typed fields" — `real_estate` now declares typed fields (address, purchase price, currency, purchase year, seller kind), all optional.
- `verification-reply`: adds the proven facts to the APPROVED line of a property paper in the VERIFICATION RESULTS block.
- `code-gates`: adds the `validate_message` rule that accepts an approved property paper as evidence for the one list change its proven seller kind implies.

## Impact

- `src/agents/declarationOfCapital/catalog.ts` — `real_estate`: `fields` (five optional typed fields) and `descriptionHe` opens with the goal sentence.
- `src/agents/declarationOfCapital/prompt.md` — the real-estate special case rewritten as goal + accepted proofs + proven-facts rule; the evidence paragraph of action 1ב gains `proven_by_file_id`.
- `src/agents/declarationOfCapital/prompt.ts` — one named function builds the proven-facts text from an approved item's stored extraction; shown in `buildDocumentsSection` and in the VERIFICATION RESULTS section.
- `src/agents/declarationOfCapital/plan.ts` — `verificationResultsForPrompt` passes the proven facts.
- `src/agents/declarationOfCapital/decisionSchema.ts` — `proven_by_file_id` on `added_instances` / `retired_documents` entries; one named validator; `DecisionContext` carries the approved property files with their proven facts.
- `evals/cases/extract_document.json`, `evals/cases/generate_message.json`, `evals/stages.ts` (the planner case's document input carries a stored verification record).
- `docs/agents.md`, `docs/pipeline.md` (new named functions), Notion Accounting → Real estate (the goal sentence; no rule change).
- No migration: the typed values live in the existing JSON verification record. Items approved before this change carry no typed fields; they show at most the ownership fact (from `parties`) and behave as today otherwise.
