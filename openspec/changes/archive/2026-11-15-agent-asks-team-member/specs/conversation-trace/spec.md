## MODIFIED Requirements

### Requirement: Every accepted tool call is executed and recorded as its own step
After the `validate_message` gate accepts a planner answer, the system SHALL execute the answer's tool calls one by one, in a fixed safe order (checklist changes, then the attestation confirmation, then file ties and collections, then the conclusion, then the team question, then the message and the fetch action), and SHALL record one code step per tool call, named exactly after the tool: `resolve_document`, `add_instance`, `retire_document`, `state_cost`, `state_vehicle`, `attestation`, `tie_file`, `mark_collected`, `ask_team`, `send_whatsapp_text`, `send_whatsapp_template`, `tax_fetch`, `conclude`. Each step SHALL record the time it ran, the call's parameters with every document and file id accompanied by its name, and the outcome of the execution. A call that changed nothing SHALL still get its step, with the outcome saying why (for example "already settled", "refused: papers differ"). The old group steps `apply_resolutions`, `apply_additions`, `apply_retirements`, `apply_stated_costs`, `apply_vehicle_declarations`, `apply_attestation`, `apply_collections`, `send_reply` and `withhold_reply` SHALL NOT be written any more; rows written before this change stay readable as they are. The gate SHALL keep checking the whole answer before any call runs, and a rejected answer SHALL execute nothing.

#### Scenario: Collect cycle
- **WHEN** the planner answers `tie_file(file F, document D)`, `mark_collected(D)`, `conclude(collect)` and the gate accepts
- **THEN** the trace shows, after the `validate_message` row, a `tie_file` step (file name, document name, outcome tied), a `mark_collected` step (document name, outcome collected), and a `conclude` step (decision collect, reply withheld, verification of D on F started), each with its own time, and no `apply_collections` or `withhold_reply` row

#### Scenario: Follow-up cycle
- **WHEN** the planner answers `resolve_document(D, not_required, quote)`, `send_whatsapp_text(text, send_at)`, `conclude(follow_up)` and the gate accepts
- **THEN** the trace shows a `resolve_document` step (document name, verdict, quote), a `conclude` step (decision follow_up), and a `send_whatsapp_text` step (scheduled time, whether it was rolled off a weekend or resolved from `asap`, the draft's id, text length), and no `apply_resolutions` or `send_reply` row

#### Scenario: Ask-team cycle
- **WHEN** the planner answers `ask_team(question, why)`, `send_whatsapp_text(text, asap)`, `conclude(follow_up)` and the gate accepts
- **THEN** the trace shows a `conclude` step, an `ask_team` step (the question, the reason, the addressee's name and address, the question id), the team-question email step, and the `send_whatsapp_text` step, in that order

#### Scenario: Rejected answer
- **WHEN** the gate rejects the answer and the corrective retry is accepted
- **THEN** only the retry's calls have steps; the rejected answer's calls have none

#### Scenario: Old trail
- **WHEN** an admin opens a client whose cycles ran before this change
- **THEN** the `apply_*`, `send_reply` and `withhold_reply` rows still show with their current labels and detail rows

### Requirement: Accountant notifications are recorded in full
Every email the platform sends to the accountant or to a team member about a client (all documents collected, documents claimed outside the chat, a document that failed verification, a passed due date, a client who declined, a question the agent asks the team) SHALL be recorded as a code step on that client's trace, with the kind of notification, the recipient address, the subject, the full body text and the mail provider's message id. When the send was blocked by the outbound fence (sandbox), the row SHALL record the fence's stand-in id so the trace shows that nothing left the platform. When the send fails, a warning step of its own SHALL be recorded with the same content and the error text, and the failure SHALL NOT stop the planning cycle or the route that triggered it. Rows written before this change are not rewritten.

#### Scenario: Goal complete email recorded
- **WHEN** the planner marks a client's collection complete and emails the accountant
- **THEN** the trace holds an `email.accountant_sent` step right after `send_closing`, whose detail carries kind `goal_complete`, the accountant's address, the subject "כל המסמכים של <client> התקבלו", the body text and the provider's message id

#### Scenario: Team question email recorded
- **WHEN** the planner asks the team a question addressed to a staff member
- **THEN** the trace holds an `email.accountant_sent` step whose detail carries kind `team_question`, the staff member's address, the subject naming the client, the body with the question and the provider's message id

#### Scenario: Send blocked by the sandbox fence
- **WHEN** the accountant's address is not on the sandbox allowlist
- **THEN** the step is recorded with the body and a stand-in id that marks the send as blocked, and no email leaves the platform

#### Scenario: Send fails
- **WHEN** the mail provider rejects the send
- **THEN** the trace holds an `email.accountant_failed` step with warning severity, the same recipient, subject and body, and the error text; the client's goal stays complete and the cycle ends normally
