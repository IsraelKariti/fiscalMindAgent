## Why

Today a received file can never add an item to the client's document list: when a study fund report arrives for a fund that is not on the list, the agent asks the client "is this yours and does it belong in the declaration?" and creates the item only on the client's quoted answer. In production (client 883423f3, 2026-10-19) the client sent a Phoenix study fund annual report in his own name, high confidence, employer printed, and the agent still asked. The document answers the question by itself; the question wastes a round trip and reads as if the agent did not read the file.

## What Changes

- A received file that **proves itself** may create its list item without a client quote. A file proves itself when code can verify all of these from the stored analysis: an institution-bound document type (bank balance, securities portfolio, pension or provident fund, study fund, life-insurance savings, mortgage balance), readable and not quarantined, confidence high, the issuing company recognised in the institutions table, at least one account or policy listed, and every listed holder name printed (not hidden) and naming the client or the spouse on file by first and last name.
- The planner cites such a file with `proven_by_file_id` (already used for approved property papers) on `add_instance`, and — new — on `resolve_document` when the catalog row of that type is still an open question or was settled as not needed. The gate accepts the file as evidence only from a code-built pool of self-evident files; everything else is still rejected and still needs a quote.
- The file is attached to the new item in the same cycle, the item is marked received and verified like any collected item, and the cycle is a `collect` decision (no message); the follow-up reply reports the verification result instead of asking a question.
- Code guarantees the created item's name carries the company (institutions table Hebrew name) and, for an employer-bound type, the printed employer — the same name pattern the per-company split uses — so a later file of another company does not match it.
- The planner's file line says when a file proves itself ("in the client's name — may be added without asking") and the planner instructions tell the agent to add it instead of asking. A file that does not prove itself (holder hidden, holder is a third person, company not recognised, confidence not high) is handled exactly as today: the agent states what it found and asks for a yes.
- The evidence stored on the created item names the file, the printed issuer, the matched holder(s) and the employer; the documents tab and the audit trail show that the item was created from a file in the client's name.

Assumption recorded: the rule covers all institution-bound types, not only study funds, because the proof (company recognised + holder is the client) is the same for a bank balance or a pension report. Not a breaking change: no schema field is removed; the quote route stays as is.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `unlisted-files`: the requirement "A list item is created only on the client's quoted words" gets a second exception — a self-evident file of an institution-bound type in the client's or spouse's name; the requirement "The agent asks the client about a file that belongs to no agreed item" no longer applies to such a file (the agent adds it and collects); the requirement "A waiting file is attached to the new item in the same cycle" covers the file that proved the item.

## Impact

- `src/agents/declarationOfCapital/decisionTools.ts` — `resolve_document` gains `proven_by_file_id`; tool descriptions.
- `src/agents/declarationOfCapital/decisionSchema.ts` — `IntakeDecisionState` gets the self-evident file pool; `validateProvenByFile` accepts it for a resolution or an addition of the file's type; a new evidence variant.
- New pure module (self-evident file rule + name building) with its own test; `plan.ts` builds the pool, feeds `assignFilesToNewRows`, stores the evidence and audits it.
- `prompt.ts` (file line marker) and `prompt.md` (planner rule for unlisted files).
- `src/db/types.ts` (`ResolutionEvidence` variant), `web/src/api.ts` + `DocumentsCard.tsx` (evidence label), `applyStepDetails.ts` (step detail).
- Tests: `tests/intakeDecision.test.ts`, `tests/fileTies.test.ts`, new module test; evals: `evals/cases/generate_message.json` (planner cases for a self-evident file and for a hidden-holder file).
- `docs/pipeline.md` rows for the new functions. No migration: `resolution_evidence` is JSON.
- Overlap: the open change `real-estate-goal-driven-clarification` introduced `proven_by_file_id` for approved property papers (not yet archived). This change widens the same field; the two must be applied in that order.
