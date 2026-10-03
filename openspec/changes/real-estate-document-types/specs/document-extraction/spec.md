## ADDED Requirements

### Requirement: The extraction prompt names the expected paper
When a file is verified against a checklist item that carries a paper (the `document-papers` capability), the extraction prompt SHALL name the expected paper by its Hebrew name beside the item's name and description, and SHALL carry the paper's anatomy hint when the paper declares one, so that the model's "is this the expected document" answer judges the paper and not only the type. The `expected_type` check of `verify_extraction` SHALL keep its observed and expected values as today. An item without a paper SHALL be verified with the prompt as before this change.

#### Scenario: Registry extract verified against the contract item
- **WHEN** a land registry extract is verified against the item "חוזה רכישה — דינוביץ 47" (paper `purchase_contract`)
- **THEN** the prompt names the expected paper "חוזה רכישה", the model answers that the file is not the expected document, and `expected_type` fails with observed "נסח טאבו"

#### Scenario: Contract verified against the contract item
- **WHEN** a purchase contract is verified against that item
- **THEN** `expected_type` passes

#### Scenario: Item without a paper
- **WHEN** a bank balance letter is verified against a bank balance item
- **THEN** the prompt the model receives is the same as before this change
