## ADDED Requirements

### Requirement: validate_message accepts an approved property paper as evidence for the list change it implies
An `added_instances` entry and a `retired_documents` entry in the planner's answer MAY carry `proven_by_file_id` (the id of a file) in place of the client quote. `validate_message` SHALL accept such an entry only when all of these hold: the anchor or target row is a `real_estate` item; the file is attached to an approved `real_estate` item of the same client; the approved file's stored extraction read a seller kind; and the change is the one that seller kind implies — `private`: the retired item carries paper `payments_appendix` or `builder_payments_report`; `builder`: the added instance carries paper `payments_appendix`. Any other use (another type, a file that is not approved, a seller kind not read, a different paper, a resolution in `resolved_documents`) SHALL be rejected through `business_rules` with a note naming the reason, as a missing quote is rejected today. An entry that carries both a quote and `proven_by_file_id` SHALL be judged by the quote. The `apply_additions` and `apply_retirements` steps and the audit trail SHALL record the file id as the evidence of the change.

#### Scenario: Private seller retires the appendix item
- **WHEN** the answer retires the item "נספח תשלומים — דינוביץ 47" with `proven_by_file_id` of the contract file approved for "חוזה רכישה — דינוביץ 47", whose extraction read `seller_kind: "private"`
- **THEN** `business_rules` passes and the retirement is applied with the file id recorded as its evidence

#### Scenario: Builder seller adds the appendix item
- **WHEN** the answer adds a `payments_appendix` instance for the property with `proven_by_file_id` of a contract file approved with `seller_kind: "builder"`
- **THEN** `business_rules` passes and the instance is created

#### Scenario: File not approved
- **WHEN** the answer cites a file that is matched to the contract item but whose verification has not run or was rejected
- **THEN** `business_rules` fails with a note saying the file is not approved, and no item changes

#### Scenario: Wrong consequence
- **WHEN** the answer cites an approved contract with `seller_kind: "private"` to add a `tabu_extract` instance
- **THEN** `business_rules` fails with a note saying the file proves nothing that calls for that item

#### Scenario: Other type
- **WHEN** the answer retires a vehicle item citing an approved vehicle licence file
- **THEN** `business_rules` fails with a note saying a file may stand as evidence only for a property's appendix
