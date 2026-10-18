## MODIFIED Requirements

### Requirement: A document type may declare a closed list of papers
A document type in the catalog MAY declare a list of papers: the concrete kinds of document the office accepts under that type. Each paper SHALL have a stable key that is unique across the whole catalog, a short Hebrew name with no date or year, and MAY carry a Hebrew anatomy hint for the file-reading models (where the paper's load-bearing content sits and which lookalike papers must not be accepted as it). A paper MAY be marked as one the client may state in the chat (the `chat-stated-cost` capability); a paper without the mark SHALL always need a received document. The `real_estate` type SHALL declare these papers: `purchase_contract` (חוזה רכישה), `payments_appendix` (נספח תשלומים), `tabu_extract` (נסח טאבו), `purchase_tax_assessment` (שומת מס רכישה), `cost_declaration` (הצהרת עלות, statable in chat), `inheritance_order` (צו ירושה) and `builder_payments_report` (דוח מצבת תשלומים מהקבלן). The `vehicle` type SHALL declare these papers: `vehicle_license` (רישיון רכב), `vehicle_purchase_document` (מסמך רכישה / קבלה) and `vehicle_cost_declaration` (הצהרת עלות, statable in chat). A type that declares no papers SHALL behave exactly as before this change.

#### Scenario: Paper keys are unique
- **WHEN** the catalog is loaded
- **THEN** no two papers of the catalog share a key, and a catalog that breaks this rule fails the project's tests

#### Scenario: Type without papers
- **WHEN** a bank balance item (a type that declares no papers) is seeded, matched, tied and verified
- **THEN** nothing about its handling differs from before this change

#### Scenario: Only the two cost declarations are statable
- **WHEN** the catalog is loaded
- **THEN** exactly the papers `cost_declaration` and `vehicle_cost_declaration` carry the statable mark

### Requirement: A checklist item of a type with papers carries its paper
Every checklist item created for a type that declares papers SHALL carry the key of the paper it stands for. The questionnaire mapping and the planner SHALL name the paper of each instance they create for such a type, from that type's list only. Their gates (`validate_form_resolutions`, `validate_message`) SHALL reject an instance of such a type that names no paper or names a paper of another type, and SHALL reject a paper on an instance of a type that declares no papers. An item made by code from another item (the per-company and per-employer split) SHALL keep the paper of the item it was made from. Items created before this change, and items the accountant adds by hand, carry no paper and SHALL be handled as today; a one-time backfill MAY set the paper of an existing `real_estate` item whose name begins with a paper's Hebrew name, and a one-time backfill MAY set the paper of an existing `vehicle` item whose name begins with "רישיון רכב", "העתק רישיון רכב", "מסמך רכישה" or "הצהרת עלות".

#### Scenario: Questionnaire creates the property's papers
- **WHEN** the questionnaire says the client bought a house on Dinovitz 47 and the mapping creates the items "חוזה רכישה — …" and "נספח תשלומים — …" for it
- **THEN** the first item carries the paper `purchase_contract` and the second `payments_appendix`

#### Scenario: Planner creates a vehicle's papers
- **WHEN** the client says they own a Mazda 3 and have its receipt, and the planner creates the items "העתק רישיון רכב בתוקף — מאזדה 3" and "מסמך רכישה / קבלה — מאזדה 3"
- **THEN** the first item carries the paper `vehicle_license` and the second `vehicle_purchase_document`

#### Scenario: Planner adds an inheritance item
- **WHEN** the client writes that a second flat came by inheritance and the planner adds the items "צו ירושה — …" with paper `inheritance_order` and "נסח טאבו — …" with paper `tabu_extract`, quoting the client
- **THEN** both items are created with those papers

#### Scenario: Instance without a paper
- **WHEN** the planner adds a `real_estate` instance and names no paper for it
- **THEN** `validate_message` rejects the answer through `business_rules`, and no item is created

#### Scenario: Paper of another type
- **WHEN** the questionnaire mapping names the paper `tabu_extract` on a `vehicle` instance
- **THEN** `validate_form_resolutions` drops that resolution with a note naming the wrong paper
