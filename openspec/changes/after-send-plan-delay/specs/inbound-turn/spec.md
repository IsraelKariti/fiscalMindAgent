## ADDED Requirements

### Requirement: The next plan after a delivered message waits
After the system delivers an outbound message to the client, it SHALL NOT run the planner at once. It SHALL request the client's deferred planner run with a configured after-send delay (`AFTER_SEND_PLAN_DELAY_SECONDS`, default 3600 seconds). A send that did not go out SHALL still re-plan at once.

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

## MODIFIED Requirements

### Requirement: A lost deferred run is recovered
The system SHALL NOT leave a client without a planner run because the deferred run was lost (process restart or queue data loss). This covers both the run of an inbound turn and the run that follows a delivered message.

#### Scenario: Worker restarts during the wait
- **WHEN** the worker restarts while a turn is waiting
- **THEN** after the restart the planner still runs once for that turn

#### Scenario: Worker restarts during the after-send delay
- **WHEN** the worker restarts while a client's after-send run is waiting, and that client has no scheduled send, is not paused and is not complete
- **THEN** after the restart the after-send run is requested again for the remaining delay (at once if the delay has already passed)
