## Why

The agent asks every client who bought a property for a purchase contract **and** a payments appendix, as one unit. The office's real rule is narrower: a second-hand purchase needs the purchase contract only; the payments appendix belongs to a purchase from a builder. Today a second-hand buyer is asked for a paper that does not exist for them, and when they say so the agent drops the contract too and sends them to fetch a purchase tax assessment and a tabu extract instead. The owner documented the correct rule on the Notion page Accounting → Real estate on 2026-10-07; the agent must follow the same rule.

## What Changes

- **Second hand vs. builder.** A property the client bought is asked about as "second hand" or "from a builder". Second hand → one item, the purchase contract (`purchase_contract`). From a builder → two items, the purchase contract plus the payments appendix (`payments_appendix`). The builder's payments report (`builder_payments_report`) stays an extra item only when the flat was not delivered and not fully paid on 31.12 of the tax year (unchanged).
- **Default when the form does not say.** When the questionnaire or the conversation says only "bought", the mapping creates the contract item alone. The planner then asks whether it was second hand or from a builder, and adds the appendix item (quoting the client) when the answer is "from a builder". Today both items are created by default.
- **The second option when the contract is lost.** The purchase tax assessment (`purchase_tax_assessment`) plus the tabu extract (`tabu_extract`) are offered only after the client says they cannot find the contract (second hand) or the contract or appendix (builder). The agent presents them as the second option, says the assessment is in the personal area of the Tax Authority website, and retires the purchase items. Today the fallback already exists; what changes is its trigger (any missing purchase paper) and its wording (a second option, usually for an old purchase).
- **Cost declaration simplified.** When the assessment shows no purchase cost (rare), the client writes the estimated price on a paper and signs it (`cost_declaration`), and sends it with the tabu extract. The agent no longer demands four specific details; it asks for the estimated cost and a signature, and names the property. Unchanged: the tabu extract stays required.
- **Wording everywhere.** The catalog description and discovery question, the questionnaire mapping prompt, the planner prompt, the docs and the eval case for a bought property follow the new rule. The seven paper keys do not change; no migration.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `document-papers`: adds the requirement that says which papers a property needs by the way the client got it (second hand, from a builder, not yet delivered, inherited, gift, prior declaration by our office) and when the second-option papers replace them; changes the scenario "Questionnaire creates the property's papers" so a second-hand purchase creates the contract item only.

## Impact

- `src/agents/declarationOfCapital/catalog.ts` — `real_estate` `descriptionHe` and `discoveryQuestionHe` (text only; keys unchanged).
- `src/agents/declarationOfCapital/formIntakeCall.ts` — the `real_estate` special-key rule in the questionnaire mapping prompt.
- `src/agents/declarationOfCapital/prompt.md` — the planner's "נכס שנרכש" branch and the cost-declaration branch.
- `evals/cases/questionnaire_schema_mapping.json` — `map_11` (bought property) expectation; one new case for "from a builder" and one for "second hand". `evals/cases/generate_message.json` — one new planner case for the lost-contract second option.
- `docs/agents.md` — the document-papers paragraph.
- Notion: Accounting → Real estate already holds the new rule (done 2026-10-07); the extraction page links to it.
- No database change, no schema change, no gate change: `paper_key` values and `matched_paper_agrees` are untouched. Existing clients with both items keep them; the planner retires the appendix only if the client says the purchase was second hand.
