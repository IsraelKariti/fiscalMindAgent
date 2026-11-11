## ADDED Requirements

### Requirement: Every accepted tool call is executed and recorded as its own step
After the `validate_message` gate accepts a planner answer, the system SHALL execute the answer's tool calls one by one, in a fixed safe order (checklist changes, then the attestation confirmation, then file ties and collections, then the conclusion, then the message and the fetch action), and SHALL record one code step per tool call, named exactly after the tool: `resolve_document`, `add_instance`, `retire_document`, `state_cost`, `state_vehicle`, `attestation`, `tie_file`, `mark_collected`, `send_whatsapp_text`, `send_whatsapp_template`, `tax_fetch`, `conclude`. Each step SHALL record the time it ran, the call's parameters with every document and file id accompanied by its name, and the outcome of the execution. A call that changed nothing SHALL still get its step, with the outcome saying why (for example "already settled", "refused: papers differ"). The old group steps `apply_resolutions`, `apply_additions`, `apply_retirements`, `apply_stated_costs`, `apply_vehicle_declarations`, `apply_attestation`, `apply_collections`, `send_reply` and `withhold_reply` SHALL NOT be written any more; rows written before this change stay readable as they are. The gate SHALL keep checking the whole answer before any call runs, and a rejected answer SHALL execute nothing.

#### Scenario: Collect cycle
- **WHEN** the planner answers `tie_file(file F, document D)`, `mark_collected(D)`, `conclude(collect)` and the gate accepts
- **THEN** the trace shows, after the `validate_message` row, a `tie_file` step (file name, document name, outcome tied), a `mark_collected` step (document name, outcome collected), and a `conclude` step (decision collect, reply withheld, verification of D on F started), each with its own time, and no `apply_collections` or `withhold_reply` row

#### Scenario: Follow-up cycle
- **WHEN** the planner answers `resolve_document(D, not_required, quote)`, `send_whatsapp_text(text, send_at)`, `conclude(follow_up)` and the gate accepts
- **THEN** the trace shows a `resolve_document` step (document name, verdict, quote), a `conclude` step (decision follow_up), and a `send_whatsapp_text` step (scheduled time, whether it was rolled off a weekend or resolved from `asap`, the draft's id, text length), and no `apply_resolutions` or `send_reply` row

#### Scenario: Rejected answer
- **WHEN** the gate rejects the answer and the corrective retry is accepted
- **THEN** only the retry's calls have steps; the rejected answer's calls have none

#### Scenario: Old trail
- **WHEN** an admin opens a client whose cycles ran before this change
- **THEN** the `apply_*`, `send_reply` and `withhold_reply` rows still show with their current labels and detail rows

### Requirement: Code outcomes are recorded on the tool call they belong to
When code adds an outcome on top of a call, that outcome SHALL be recorded on that call's step, never on a step of its own: a `tie_file` step SHALL say whether the pair was tied, re-pointed to a row the per-company or per-employer split created (with the rename of the item, its old and new name, and every created sibling with its name, file and employer), or refused with the reason (company differs, paper differs, file quarantined, split parent); a `mark_collected` step SHALL say whether the document became collected, became claimed (no file proves it), or stayed pending because its tie was refused or it was not pending; an `add_instance` step SHALL list the created rows with their names, the files code assigned to them, and whether a row was born claimed; a `send_whatsapp_text` or `send_whatsapp_template` step SHALL record the requested time, the scheduled time, whether it was rolled off a weekend or chag or resolved from `asap`, the draft id and, for a template, its name and variables; an `attestation` step SHALL record its action and, for a request, the draft it rides on.

#### Scenario: Three companies for one item
- **WHEN** the planner ties three children of one PDF, from Harel, Clal and Migdal, to the item "ביטוח מנהלים ניב", which names no company
- **THEN** the first `tie_file` step records the rename "ביטוח מנהלים ניב" → "ביטוח מנהלים ניב — הראל", the second and third record the sibling each created ("… — כלל", "… — מגדל") with its file, and each step names the row its file ended under

#### Scenario: Refused tie leaves the document pending
- **WHEN** the planner ties a registry extract to a contract item and marks the item collected
- **THEN** the `tie_file` step says refused because the papers differ, and the `mark_collected` step says the item stayed pending because its tie was refused

#### Scenario: Claimed instead of collected
- **WHEN** the planner marks a document collected that no received file proves
- **THEN** the `mark_collected` step says the document became claimed and waits for the accountant

#### Scenario: Send time rolled
- **WHEN** the planner sends a text with `send_at` on a Saturday
- **THEN** the `send_whatsapp_text` step shows the requested time, the rolled time and that it was rolled

### Requirement: The conclude step records the decision and what the cycle did with it
The `conclude` step SHALL record the decision and the reasoning, and what the code did with the decision: for `collect`, that the reply is withheld and which documents are being verified against which files; for `follow_up`, that a message was scheduled (the message step follows); for `goal_complete`, that the goal was completed, or that the answer was premature and the cycle failed; for `client_declined`, that the decline routine took over.

#### Scenario: Collect
- **WHEN** the answer concludes `collect` after tying one file
- **THEN** the `conclude` step lists the document and file pair being verified and says the reply is withheld until the verification ends

#### Scenario: Goal complete
- **WHEN** the answer concludes `goal_complete` and every row is settled and the attestation is confirmed
- **THEN** the `conclude` step says the goal was completed, and the `goal.completed` and `send_closing` rows follow as today

### Requirement: A tool-call step is recognisable in the trace
In both trace surfaces (the workspace conversation tab under impersonation and the admin conversation viewer), a step named after a planner tool SHALL show a tool icon, distinct from the shield of checks and security events and the gear of code-only actions. Its label SHALL be the tool's technical name as the call modal shows it. The step modal SHALL render a tool step's parameters and outcome as labelled plain-language rows (document and file names, verdicts, quotes, times, outcomes), with unknown keys still listed generically, as it does for the gate and apply rows today.

#### Scenario: Icons
- **WHEN** an admin views a cycle with `validate_message`, `tie_file`, `conclude` and, later, `send_closing`
- **THEN** `validate_message` shows the shield, `tie_file` and `conclude` the tool icon, `send_closing` the gear

#### Scenario: Step modal of a tie
- **WHEN** the admin opens the `tie_file` step
- **THEN** the modal shows the file name, the document name, the evidence quote when there is one, and the outcome line

### Requirement: Discarded drafts are matched on the message steps
The conversation endpoint SHALL recognise the step that scheduled a draft by the `send_whatsapp_text` and `send_whatsapp_template` steps of this change as well as by the `send_reply` step of older trails, so that a draft a re-plan discarded, its step and its call are flagged as today.

#### Scenario: Discarded draft after this change
- **WHEN** a `send_whatsapp_text` step scheduled a draft and a later re-plan discarded it
- **THEN** the draft shows as a discarded-draft row, its `send_whatsapp_text` step and its `generate_message` call are hidden when the LLM calls toggle is off, as the `send_reply` case is today

### Requirement: Old step names in other specs refer to the tool-call steps
Wherever another capability's spec names an `apply_*` step as the place a planner outcome is recorded (`apply_collections` for split, pair and refusal records in `unlisted-files` and `document-papers`; `apply_stated_costs` for the stated-cost audit row in `code-gates`), that fact SHALL be recorded on the tool-call step of the call it belongs to (`tie_file`, `mark_collected`, `state_cost`, `add_instance`) with the same content, and the requirement is satisfied by that step.

#### Scenario: Stated cost
- **WHEN** the answer states 85000 ILS on the item "הצהרת עלות — מאזדה 3" with a verbatim quote
- **THEN** the `state_cost` step lists that item with its id, its name, 85000, ILS and the quote, which satisfies the `code-gates` requirement that names `apply_stated_costs`

## MODIFIED Requirements

### Requirement: Apply steps record what they changed by name
The planner's tool-call steps SHALL record, in their audit detail, a human-readable name for every document and file they touched, alongside the id: `resolve_document` (document name, verdict, quote or the self-evident file that settled it, and the instance names for a required resolution), `add_instance` (anchor document name, the created rows' names, the files assigned to them), `retire_document` (document name and evidence quote), `state_cost` (document name, amount, currency and evidence quote — the `chat-stated-cost` capability), `state_vehicle` (document name and the stated facts), `tie_file` (file name and document name, the split it caused with the renamed item's old and new name and every created item with its name, file and employer, or the refusal reason), `mark_collected` (document name and whether it became collected or claimed or stayed pending), and the `document.collected` row (document names). Rows written before this change are not rewritten.

#### Scenario: Retirement recorded with its name
- **WHEN** the planner retires the document "אישור יתרות — בנק הפועלים" with an evidence quote
- **THEN** the `retire_document` step lists that document with its id, its name and the quote

#### Scenario: Stated cost recorded with its name
- **WHEN** the planner states 85000 ILS on the document "הצהרת עלות — מאזדה 3" with the quote "אין לי את הקבלה, שילמתי 85,000 ש"ח"
- **THEN** the `state_cost` step lists that document with its id, its name, 85000, ILS and the quote, and the step modal shows these lines

#### Scenario: Collection recorded with names
- **WHEN** the planner marks two documents collected and ties one received file to one of them
- **THEN** each `mark_collected` step names its document and its outcome, and the `tie_file` step shows the file name with the document name

#### Scenario: Company split recorded
- **WHEN** the planner ties Harel and Clal files to the item "ביטוח מנהלים ניב" and code splits it by company
- **THEN** the Harel `tie_file` step lists the rename "ביטוח מנהלים ניב" → "ביטוח מנהלים ניב — הראל", the Clal `tie_file` step lists the created item "ביטוח מנהלים ניב — כלל" with the Clal file's name, and each step names the item its file ended under; the step modal shows these lines
