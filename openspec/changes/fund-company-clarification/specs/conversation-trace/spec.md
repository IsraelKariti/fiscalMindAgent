## ADDED Requirements

### Requirement: The set_company call is recorded as its own step
The `set_company` tool SHALL be executed and recorded like every other planner tool call: one code step named `set_company` per call, in the checklist-changes group (before `add_instance` of the same answer, so an added sibling can rely on the renamed head), recording the row's id and name, the new name, the company as the client named it, whether the company was recognised in the institutions table (and its table key when it was), the evidence message id and quote, and the outcome (renamed, or why nothing changed). The audit event `document.company_set` SHALL carry the same facts.

#### Scenario: Company set and recorded
- **WHEN** the planner answers `set_company(row R, "מגדל", quote "הפנסיה שלי במגדל")` and the gate accepts
- **THEN** the trace shows a `set_company` step with R's id, old name, new name "… — מגדל", company key `migdal`, the quote, outcome renamed, and an audit event `document.company_set` with the same detail

#### Scenario: Row raced out of pending
- **WHEN** the row was collected between the gate and the execution
- **THEN** the `set_company` step records outcome "no change: the row is no longer pending" and no rename happens
