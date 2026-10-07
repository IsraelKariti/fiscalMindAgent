## Context

See proposal.md — Why. The rule "which papers a property needs" lives only in prompt text today: the `real_estate` entry of the catalog (`descriptionHe`, `discoveryQuestionHe`), the `real_estate` special-key paragraph of the questionnaire-mapping prompt (`formIntakeCall.ts`), and the "נכס שנרכש" branch of the planner prompt (`prompt.md`). No code gate, no schema and no test hard-codes "contract + appendix": the gates only check that a `real_estate` instance names one of the seven papers (`instancePaperFault`), and `matched_paper_agrees` / `paper_differs` compare papers, whatever the items are. The eval case `map_11` (questionnaire mapping) is the one stored expectation of the old rule. The Notion page Accounting → Real estate already states the new rule and is the reference for the wording.

## Goals / Non-Goals

**Goals:**
- Make the three prompts say the same rule as the Notion page, with the same branch names: second hand, from a builder, not yet delivered, inherited, gift, prior declaration by our office, contract lost (second option), assessment without cost.
- Keep the seven paper keys, the item-level `paper_key`, the gates and the file checks untouched.
- Pin the new rule with eval cases so a later prompt edit cannot silently bring the old rule back.

**Non-Goals:**
- No new paper, no new catalog type, no migration, no change to `validate_classification`, `paper_differs` or the extraction prompt.
- No backfill of existing clients' items. The planner fixes an existing pair only when the client says the purchase was second hand.
- No change to the vehicle cost-declaration rule, which uses the same `cost_declaration` word but a different type.

## Decisions

**D1. The rule stays in prompt text, not in code.**
The office's rule has many branches and will change again (this change is the second edit in four days). A code table would need its own schema for "how received" and a way for the model to report it, and today nothing stores that fact. So the catalog description, the mapping prompt and the planner prompt carry the rule as text; the gates keep checking only that each instance names a valid paper of its type.
*Alternative:* add `acquisition` to the instance schema and derive the papers in code. Rejected for now: it adds a stored field and a gate for a rule that is still moving. Revisit if the rule stops changing.

**D2. Default when the form says only "bought": the contract item alone.**
The planner asks "second hand or from a builder?" in its first clarifying message anyway (it already asks how each property was received). Adding an item on the client's answer is the normal planner path (`added_instances` with a quote). Asking a second-hand buyer for a paper that does not exist is the bug this change fixes, so the default must not create the appendix.
*Alternative:* default to both items and retire the appendix when the client says second hand. Rejected: most purchases are second hand, so the default would be wrong most of the time, and a client who never answers the question would be chased for a non-existent paper.

**D3. Second-option trigger: any missing purchase item of that property.**
For a second-hand purchase that is the contract. For a builder purchase it is the contract or the appendix: the office prices a builder flat from the two together, so a missing appendix leaves the cost unproven, same as today. The planner retires every purchase item of that property (also one already received) and adds the assessment and the tabu extract, as the current prompt does.

**D4. Cost declaration: estimated price plus signature.**
The current prompt demands four details (address, year, buyers, cost). The owner's rule is simpler: the client writes the estimated price and signs. The planner names the property in its request so the paper can be told apart when the client owns several, but the prompt stops listing four mandatory details. The paper's `analysisHintHe` in the catalog is relaxed the same way so the classifier does not reject a plain signed note.

**D5. Wording of the discovery question.**
`discoveryQuestionHe` asks, per property, how it was received with the choices second hand / from a builder (delivered or not) / inherited / gift, and whether it is already in a prior declaration by our office. It no longer asks "are the contract and the appendix in your hands?" for every purchase; the planner asks for the papers of the chosen branch and offers the second option only when the client says a paper is missing.

**D6. Evals pin the rule.**
`map_11` changes to the "bought, source unknown" case (contract item only). Two new mapping cases cover second hand and from a builder. One new `generate_message` case covers the lost-contract second option (retire contract, add assessment + tabu, wording). The judge for `questionnaire_schema_mapping` already compares instance name fragments; no harness change.

## Risks / Trade-offs

- [The model keeps creating the appendix for "bought" out of habit] → `map_11` and the new second-hand case fail; the mapping prompt states the default in one explicit sentence ("נרכש בלי לציין — חוזה רכישה בלבד").
- [A builder buyer answers late and the appendix is added only after the contract arrived] → acceptable; the item is added with the client's quote and the planner asks for it in the same reply.
- [Existing clients hold a contract + appendix pair for a second-hand flat] → the planner retires the appendix when the client says second hand; otherwise the pair stays, as today. No batch fix.
- [A plain signed note is classified as `other`, not `cost_declaration`] → the relaxed `analysisHintHe` names the minimal form (a handwritten or printed note with a price and a signature). If the classifier still misses it, the owner can tie the file by hand in the workspace.

## Migration Plan

Prompt and eval text only. Deploy with the normal push to master (sandbox) and the manual promotion. No migration, no rollback steps beyond reverting the commit.
