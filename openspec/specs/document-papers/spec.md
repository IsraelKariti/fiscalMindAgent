# document-papers Specification

## Purpose

The closed list of papers a document type accepts (for a property: purchase contract, payments appendix, land registry extract, …), how a checklist item and a received file each carry their paper, and the code checks that stop a file of one paper from being matched to an item of another.

## Requirements

### Requirement: A document type may declare a closed list of papers
A document type in the catalog MAY declare a list of papers: the concrete kinds of document the office accepts under that type. Each paper SHALL have a stable key that is unique across the whole catalog, a short Hebrew name with no date or year, and MAY carry a Hebrew anatomy hint for the file-reading models (where the paper's load-bearing content sits and which lookalike papers must not be accepted as it). The `real_estate` type SHALL declare these papers: `purchase_contract` (חוזה רכישה), `payments_appendix` (נספח תשלומים), `tabu_extract` (נסח טאבו), `purchase_tax_assessment` (שומת מס רכישה), `cost_declaration` (הצהרת עלות), `inheritance_order` (צו ירושה) and `builder_payments_report` (דוח מצבת תשלומים מהקבלן). A type that declares no papers SHALL behave exactly as before this change.

#### Scenario: Paper keys are unique
- **WHEN** the catalog is loaded
- **THEN** no two papers of the catalog share a key, and a catalog that breaks this rule fails the project's tests

#### Scenario: Type without papers
- **WHEN** a bank balance item (a type that declares no papers) is seeded, matched, tied and verified
- **THEN** nothing about its handling differs from before this change

### Requirement: A checklist item of a type with papers carries its paper
Every checklist item created for a type that declares papers SHALL carry the key of the paper it stands for. The questionnaire mapping and the planner SHALL name the paper of each instance they create for such a type, from that type's list only. Their gates (`validate_form_resolutions`, `validate_message`) SHALL reject an instance of such a type that names no paper or names a paper of another type, and SHALL reject a paper on an instance of a type that declares no papers. An item made by code from another item (the per-company and per-employer split) SHALL keep the paper of the item it was made from. Items created before this change, and items the accountant adds by hand, carry no paper and SHALL be handled as today; a one-time backfill MAY set the paper of an existing `real_estate` item whose name begins with a paper's Hebrew name.

#### Scenario: Questionnaire creates the property's papers
- **WHEN** the questionnaire says the client bought a house on Dinovitz 47 and the mapping creates the items "חוזה רכישה — …" and "נספח תשלומים — …" for it
- **THEN** the first item carries the paper `purchase_contract` and the second `payments_appendix`

#### Scenario: Planner adds an inheritance item
- **WHEN** the client writes that a second flat came by inheritance and the planner adds the items "צו ירושה — …" with paper `inheritance_order` and "נסח טאבו — …" with paper `tabu_extract`, quoting the client
- **THEN** both items are created with those papers

#### Scenario: Instance without a paper
- **WHEN** the planner adds a `real_estate` instance and names no paper for it
- **THEN** `validate_message` rejects the answer through `business_rules`, and no item is created

#### Scenario: Paper of another type
- **WHEN** the questionnaire mapping names the paper `tabu_extract` on a `vehicle` instance
- **THEN** `validate_form_resolutions` drops that resolution with a note naming the wrong paper

### Requirement: The file check names the paper of a file
For every file it classifies, the file classifier SHALL name, beside the file's document type, the paper the file is, from the closed list of all papers in the catalog, or no paper when the file is of a type without papers or is none of that type's papers. A paper that does not belong to the file's document type SHALL count as no paper. The planner's file line and the step detail of `validate_classification` SHALL show the paper.

#### Scenario: Registry extract
- **WHEN** the client sends a land registry extract
- **THEN** the file's analysis names the type `real_estate` and the paper `tabu_extract`

#### Scenario: Paper of the wrong type
- **WHEN** the classifier names the type `vehicle` and the paper `purchase_contract`
- **THEN** the file's analysis carries no paper

### Requirement: A file is matched or tied only to an item of its paper
When the file classifier matches a file to an item that carries a paper, `validate_classification` SHALL keep the match only when the file's paper equals the item's paper, and SHALL drop it otherwise — also when the file carries no paper. The gate SHALL report this as the check `matched_paper_agrees`, with the file's paper (or "not identified") as the observed value and the item's paper as the expected value; the check SHALL be absent when no item was matched, when the match was already dropped by an earlier check, or when the matched item carries no paper. The same comparison SHALL guard every tie the planner proposes between a file and an item that carries a paper (a file paired with an existing item, and a file named for a new item): a tie whose papers differ, or whose file carries no paper, SHALL be refused and reported in the `apply_collections` step like the type refusal. A dropped or refused file SHALL stay unattached and be treated as a file that matches no item.

#### Scenario: Registry extract offered to the contract item
- **WHEN** a PDF is cut into a purchase contract (pages 1-4) and a registry extract (page 5), and the classifier matches both children to the item "חוזה רכישה — …" (paper `purchase_contract`)
- **THEN** the first match is kept; the second is dropped, `matched_paper_agrees` is reported failed with observed `tabu_extract` and expected `purchase_contract`, and page 5 ends as a file that matches no item

#### Scenario: Payments appendix
- **WHEN** the classifier matches a payments appendix to the item "נספח תשלומים — …" (paper `payments_appendix`)
- **THEN** the match is kept and `matched_paper_agrees` is reported passed

#### Scenario: Planner pairs a file of another paper
- **WHEN** the planner pairs the registry extract with the contract item in `apply_collections`
- **THEN** the pair is refused, the file stays unattached, and the item is not marked received because of it

#### Scenario: Old item without a paper
- **WHEN** the classifier matches a registry extract to a `real_estate` item created before this change, which carries no paper
- **THEN** `matched_paper_agrees` is absent and the match is handled as before this change
