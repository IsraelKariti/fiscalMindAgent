## MODIFIED Requirements

### Requirement: Every accepted tool call is executed and recorded as its own step
The system SHALL execute the calls of each model turn as soon as the turn's `validate_message` row is written, in the fixed safe order within the turn (checklist changes, then the attestation confirmation, then file ties and collections, then the team question, then the terminal call), and SHALL record one code step per call, accepted or refused, named exactly after the tool: `set_required`, `add_instance`, `retire_document`, `state_cost`, `state_vehicle`, `set_company`, `attestation`, `tie_file`, `mark_collected`, `ask_team`, `send_whatsapp_text`, `send_whatsapp_template`, `goal_complete`, `client_declined`, `document_fetch`. Each step SHALL record the time it ran, the turn that made the call, the call's parameters with every document and file id accompanied by its name, the outcome of the execution, and the result text returned to the model. A refused call SHALL get its step with the refusal as outcome and result. Steps of a later turn come after the steps of the earlier turn in the trail. The old group steps `apply_resolutions`, `apply_additions`, `apply_retirements`, `apply_stated_costs`, `apply_vehicle_declarations`, `apply_attestation`, `apply_collections`, `send_reply` and `withhold_reply` SHALL NOT be written; rows written before this change stay readable as they are.

#### Scenario: Collect cycle
- **WHEN** the model's first turn is `tie_file(F, D)` and `mark_collected(D)`, and its second turn `send_whatsapp_text(...)`
- **THEN** the trail shows `validate_message` (turn 1), a `tie_file` step (file name, document name, outcome tied, the verdict and the result text), a `mark_collected` step (document name, outcome collected), the `verify_extraction` row, `validate_message` (turn 2), the `send_whatsapp_text` step (turn 2) and the code-written `conclude` step, and no `apply_collections` or `withhold_reply` row

#### Scenario: Follow-up cycle
- **WHEN** the model's single turn is `set_required(D, not_required, quote)` and `send_whatsapp_text(text, send_at)`
- **THEN** the trail shows a `set_required` step (document name, verdict, quote, result text), a `send_whatsapp_text` step (scheduled time, whether it was rolled off a weekend or resolved from `asap`, the draft's id, text length) and a `conclude` step saying a message was scheduled, and no `apply_resolutions` or `send_reply` row

#### Scenario: Ask-team cycle
- **WHEN** the model's turn is `ask_team(question, why)` and `send_whatsapp_text(text, asap)`
- **THEN** the trail shows the `ask_team` step (the question, the reason, the addressee's name and address, the question id), the team-question email step, the `send_whatsapp_text` step and the `conclude` step, in that order

#### Scenario: Rejected answer
- **WHEN** a `tie_file` call is refused because the papers differ and the model ties another row in its next turn
- **THEN** both calls have steps: the first with outcome refused, the reason and the result text the model was given; the second with its own outcome

#### Scenario: Old trail
- **WHEN** an admin opens a client whose cycles ran before this change
- **THEN** the `apply_*`, `send_reply` and `withhold_reply` rows still show with their current labels and detail rows

### Requirement: The conclude step records the decision and what the cycle did with it
The `conclude` step SHALL be written by code at the end of every planner run, never by a model call. It SHALL record how the run ended: a message scheduled (which draft, for when), the goal completed (the `goal.completed` and `send_closing` rows follow), the client declined (the decline routine took over), or a failure (no ending after the corrective turn, or the turn cap) with the number of turns made. It SHALL carry the reasoning of the terminal call when there is one, and the number of turns of the run.

#### Scenario: Collect
- **WHEN** a run ties one file, gets its verdict and ends with an accepted `send_whatsapp_text`
- **THEN** the `conclude` step says a message was scheduled, names the draft and its time, carries the call's reasoning and a turn count of two; there is no "reply withheld" wording

#### Scenario: Goal complete
- **WHEN** the run ends with an accepted `goal_complete` because every row is settled and the attestation is confirmed
- **THEN** the `conclude` step says the goal was completed, and the `goal.completed` and `send_closing` rows follow as today

#### Scenario: Run failed on the ending rule
- **WHEN** a run ends with two text-only turns
- **THEN** the `conclude` step says the run failed with no ending, with the turn count, and the step is marked as a warning

#### Scenario: Old trail
- **WHEN** an admin opens a trail recorded before this change
- **THEN** its `conclude` step (made by the model's call) still shows with its decision and reasoning
