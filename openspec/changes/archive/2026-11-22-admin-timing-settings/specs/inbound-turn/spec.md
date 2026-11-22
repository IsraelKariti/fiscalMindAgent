## ADDED Requirements

### Requirement: Admin settings show and edit the message timing
The admin settings page SHALL have a "message timing" section that shows and edits three values in whole seconds: the quiet window after the client's last message, the maximum wait of a turn, and the delay after the agent's own delivered message. A saved value SHALL apply to every accountant and every client from the next timing decision, without a restart of the web or the worker process. A value that was never saved SHALL be the server's configured default (`INBOUND_QUIET_SECONDS`, `INBOUND_MAX_WAIT_SECONDS`, `AFTER_SEND_PLAN_DELAY_SECONDS`, and their code defaults 15, 300 and 3600), and the section SHALL show that effective value. The section SHALL refuse a save that is not a whole number, a quiet window or maximum wait below 1 second, an after-send delay below 0 seconds, or a maximum wait shorter than the quiet window; the refusal SHALL say why and the shown values SHALL stay the saved ones.

#### Scenario: Admin shortens the quiet window
- **WHEN** an admin saves a quiet window of 30 seconds while the server default is 125
- **THEN** the next client message is planned 30 seconds after the client's last message, and the section shows 30

#### Scenario: Nothing saved yet
- **WHEN** no admin has saved the section and the server runs with `INBOUND_QUIET_SECONDS=125`
- **THEN** the section shows 125 for the quiet window and the system waits 125 seconds, as before this change

#### Scenario: Maximum wait shorter than the quiet window refused
- **WHEN** an admin tries to save a quiet window of 120 and a maximum wait of 60
- **THEN** the save is refused with a message saying the maximum wait must be at least the quiet window, and the section keeps the saved values

#### Scenario: After-send delay set to zero
- **WHEN** an admin saves an after-send delay of 0
- **THEN** the planner runs right after each delivered message, as it did before the after-send delay existed

## MODIFIED Requirements

### Requirement: Quiet window after the last inbound
The planner SHALL run only after the quiet window — the admin-set value, else the configured default — has passed since the client's most recent inbound webhook. Each new inbound webhook of the same client SHALL restart the window. A change of the value SHALL apply to the next decision: a turn already waiting is re-timed when its next inbound arrives, and a wait already queued keeps its time.

#### Scenario: Client keeps sending
- **WHEN** a client sends a second file before the quiet window of the first file has passed
- **THEN** the window restarts from the second file, and the planner has not run in between

#### Scenario: Value changed mid-turn
- **WHEN** an admin changes the quiet window from 125 to 30 seconds while a client's turn is waiting
- **THEN** the pending run keeps its 125-second time; the client's next message is timed with 30 seconds

### Requirement: Maximum wait
The system SHALL bound the total wait of a turn. When the maximum wait — the admin-set value, else the configured default — has passed since the first inbound of the turn, the planner SHALL run with whatever is finished, and the event SHALL be logged as a warning. While the planner's own provider or a provider the turn's held work needs is held, the maximum wait SHALL NOT force a run: the turn keeps waiting and is planned after recovery.

#### Scenario: Processing hangs
- **WHEN** inbound processing for a client is still marked in flight after the maximum wait and no provider is held
- **THEN** the planner runs once, a warning names the client and the unfinished work, and unfinished files appear to the planner as not yet analyzed

#### Scenario: Maximum wait during a hold
- **WHEN** the maximum wait passes while the planner's provider is held
- **THEN** the planner does not run, the client stays in the waiting state, and the turn is planned once after the hold clears

### Requirement: The next plan after a delivered message waits
After the system delivers an outbound message to the client, it SHALL NOT run the planner at once. It SHALL request the client's deferred planner run with the after-send delay — the admin-set value, else the configured default (`AFTER_SEND_PLAN_DELAY_SECONDS`, default 3600 seconds). A send that did not go out SHALL still re-plan at once.

#### Scenario: Message delivered, client silent
- **WHEN** the agent's WhatsApp message is delivered and the client sends nothing for the whole after-send delay
- **THEN** the planner runs once, after the delay, and the draft it stores carries the trigger `agent_message_sent`

#### Scenario: Client replies inside the delay
- **WHEN** the agent's message is delivered and the client replies before the after-send delay has passed
- **THEN** the pending after-send run is replaced by the inbound turn: the planner runs once, after the quiet window of the reply, with the trigger `client_message`, and the maximum wait counts from the reply, not from the send

#### Scenario: A turn is already pending when the send completes
- **WHEN** a client reply is already waiting for its quiet window while the agent's message is delivered
- **THEN** the pending turn stays as it is, no after-send run is added, and the planner runs once under the turn rules

#### Scenario: Send did not go out
- **WHEN** a scheduled send is abandoned because the 24-hour WhatsApp window closed or the draft is no longer sendable
- **THEN** the planner runs at once, as before this change
