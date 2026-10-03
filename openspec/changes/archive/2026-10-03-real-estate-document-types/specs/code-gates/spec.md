## ADDED Requirements

### Requirement: Checks reported for document papers
In addition to the checks listed for each existing gate, the gates SHALL report these checks for document papers (the `document-papers` capability):

- `validate_classification`: `matched_paper_agrees` when a known id of agreeing type was matched and the matched row carries a paper (fails when the file's paper differs from the row's paper or the file carries no paper; `observed` = the file's paper or "not identified", `expected` = the row's paper). Absent when no row was matched, when an earlier check dropped the match, or when the row carries no paper.
- `validate_form_resolutions`: the per-type entry fails, with the drop reason as `note`, when a required instance of a type with papers names no paper or names a paper of another type, or when an instance of a type without papers names a paper.
- `validate_message`: `business_rules` fails, with the rejection message as `note`, for the same instance faults in `resolved_documents` and `added_instances`.

#### Scenario: Paper check fails
- **WHEN** the classifier matches a file whose paper is `tabu_extract` to a row whose paper is `purchase_contract`
- **THEN** the `validate_classification` row has `result: false`, `matched_id_known` and `matched_type_agrees` passed, and `matched_paper_agrees` failed with observed `tabu_extract` and expected `purchase_contract`

#### Scenario: Paper check absent for a row without a paper
- **WHEN** the classifier matches a file to a `bank_balance` row
- **THEN** the `validate_classification` row has no `matched_paper_agrees` entry

#### Scenario: Form instance without a paper
- **WHEN** the questionnaire mapping returns a required `real_estate` resolution whose instance names no paper
- **THEN** the `validate_form_resolutions` entry for `real_estate` has `passed: false` and a note saying the instance names no paper
