## MODIFIED Requirements

### Requirement: A document type may declare a closed list of papers
A document type in the catalog MAY declare a list of papers: the concrete kinds of document the office accepts under that type. Each paper SHALL have a stable key that is unique across the whole catalog, a short Hebrew name with no date or year, and MAY carry a Hebrew anatomy hint for the file-reading models (where the paper's load-bearing content sits and which lookalike papers must not be accepted as it). A paper MAY be marked as one the client may state in the chat (the `chat-stated-cost` and `vehicle-declaration` capabilities); a paper without the mark SHALL always need a received document. The `real_estate` type SHALL declare these papers: `purchase_contract` (חוזה רכישה), `payments_appendix` (נספח תשלומים), `tabu_extract` (נסח טאבו), `purchase_tax_assessment` (שומת מס רכישה), `cost_declaration` (הצהרת עלות, statable in chat), `inheritance_order` (צו ירושה) and `builder_payments_report` (דוח מצבת תשלומים מהקבלן). The `vehicle` type SHALL declare these papers: `vehicle_license` (רישיון רכב), `vehicle_purchase_document` (מסמך רכישה / קבלה) and `vehicle_declaration` (הצהרת הלקוח על הרכב, statable in chat). The paper `vehicle_cost_declaration` SHALL no longer exist: a stored item that carried it SHALL be carried over to `vehicle_declaration` once, keeping its stated cost. A type that declares no papers SHALL behave exactly as before this change.

#### Scenario: Paper keys are unique
- **WHEN** the catalog is loaded
- **THEN** no two papers of the catalog share a key, and a catalog that breaks this rule fails the project's tests

#### Scenario: Type without papers
- **WHEN** a bank balance item (a type that declares no papers) is seeded, matched, tied and verified
- **THEN** nothing about its handling differs from before this change

#### Scenario: Only the two cost declarations are statable
- **WHEN** the catalog is loaded
- **THEN** exactly the papers `cost_declaration` and `vehicle_declaration` carry the statable mark

#### Scenario: Old vehicle cost declaration rows are carried over
- **WHEN** a client has an item with the paper `vehicle_cost_declaration` that was stated in the chat with the amount 85,000 ILS
- **THEN** after the carry-over the item carries the paper `vehicle_declaration`, is still stated, and its recorded facts hold the purchase cost 85,000 ILS and the original quote
