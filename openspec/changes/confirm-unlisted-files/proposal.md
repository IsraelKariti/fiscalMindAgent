## Why

A file can arrive for something the client never told us about. Two live tests on 2026-09-19 showed what the agent does today:

- The list held one study fund (Altshuler Shaham, approved). The client sent a certificate of a second study fund (Harel). The file check said the file belongs to the Altshuler item. The agent then added a Harel item to the list on its own, from the file alone.
- The client sent a pension report while pension had never been discussed. The file check matched it to the still-open pension question, and the agent settled the question, collected the file and approved it, all without a word from the client.

Owner decision (2026-09-19): the list of required documents is an agreement with the client. A file never changes it. A file that does not belong to an item already agreed stays unattached, the agent asks the client about it, and only after the client confirms in words is the item created — and then the file is attached to it and checked in that same turn.

## What Changes

- The file check is shown only the items a file can satisfy: items already agreed with the client. Open questions (`unresolved`), items settled as not needed (`not_required`) and replaced items (`retired`) are no longer offered as match candidates, so a file of a type never discussed ends as "matches no document".
- The file check is told that an item names a specific institution, account or asset: a file of another bank, fund, company or asset is not a match, even when the type is the same.
- The planner may create list items only on the client's words: every "needed" resolution and every added item must carry evidence — a stored inbound message of the client and a verbatim quote from it — exactly like "not needed" resolutions and retirements already do. A message that carried only a file has no text to quote, so a file alone can never create an item. **BREAKING** for the planner's answer format: `resolved_documents[].evidence` becomes mandatory for `required`, and `added_instances[]` gains a mandatory `evidence`.
- The planner's instructions gain the rule: a received file that matches no document but looks relevant to the declaration is never grounds for a list change; mention it to the client, ask whether this account / fund / asset is theirs and belongs in the declaration, and wait. A clear statement in the client's own words (also one that arrived together with the file) counts as the confirmation.
- When the planner creates an item on the client's confirmation, it can name the already-received files that are this document. Code attaches each named file to the new item and marks the item collected in the same cycle, under the same evidence rules as any received file, so the file goes to verification in that turn. This lifts today's limit ("an item created in a cycle cannot receive its file in that cycle") for this case.
- Until the client answers, the unattached file stays in the "unmatched files" group of the documents tab, as today.

## Capabilities

### New Capabilities

- `unlisted-files`: how the agent treats a received file that belongs to no agreed list item — no match in the file check, a question to the client, item creation only on the client's quoted words, and attaching the waiting file to the new item in the same cycle.

### Modified Capabilities

None. (`code-gates` already describes `validate_message` `business_rules` as covering "evidence quotes"; the new evidence rules are reported through that same check.)

## Impact

- `src/agents/declarationOfCapital/analyzeInboundFile.ts` — which rows are passed to the classifier; `analyzeFile.ts` — institution rule in `ANALYSIS_PROMPT`.
- `src/agents/declarationOfCapital/decisionSchema.ts` — response schema (Gemini + Anthropic variants), `validateResolutions`, `validateAddedInstances`, new `file_ids` on instances and its validation; decision types.
- `src/agents/declarationOfCapital/plan.ts` — attach + collect named files after `resolveRequired` / `addInstances`; audit detail carries the evidence.
- `src/db/queries/clientDocuments.ts` — `resolveRequired` / `addInstances` store the evidence (existing evidence column) — to confirm during apply.
- `src/agents/declarationOfCapital/prompt.md` (Hebrew system prompt), `applyStepDetails.ts` / `web/src/components/stepSummary.ts` (show the quote and the attached files in the step detail).
- Tests: `intakeDecision.test.ts`, `analyzeFileRules.test.ts`, `anthropicSchema.test.ts`, `applyStepDetails.test.ts`. Evals: new `generate_message` cases and one `file_classification` case (needs one new synthetic PDF, the Harel certificate); existing `generate_message` cases that expect a "needed" resolution are re-judged.
- `docs/agents.md`. No migration, no new env var, no new LLM call.
