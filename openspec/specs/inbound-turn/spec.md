# inbound-turn Specification

## Purpose
Defines when the planner runs after inbound client activity: the messages and files a client sends close together form one turn, and the agent writes one reply for the turn, only after all processing of that turn is finished.

## Requirements

### Requirement: One planner run per client turn
The system SHALL group the inbound messages and files a client sends close together into one turn, and SHALL run the planner once for the turn. An inbound webhook SHALL NOT run the planner by itself.

#### Scenario: Text and several files sent together
- **WHEN** a client sends one text message and four files within a few seconds, delivered as five separate webhooks
- **THEN** the planner runs exactly once, and its input holds the text message and the analysis results of all four files

#### Scenario: Single message
- **WHEN** a client sends one text message and nothing else
- **THEN** the planner runs once, after the quiet window has passed

### Requirement: The planner waits for all inbound processing
The planner SHALL NOT run for a client while any inbound processing for that client is in flight. Inbound processing covers the file download, the injection screens of the message and of each file, file splitting, and the classification of every file and every split child. A message or file held by a provider outage (see `llm-provider-outage`) SHALL count as in flight until it is screened or analyzed after recovery.

#### Scenario: A slow file
- **WHEN** a client sends a text message and a large PDF, and the PDF is still being split and classified after the quiet window has passed
- **THEN** no planner run and no draft happen until the PDF and all of its child files have an analysis result

#### Scenario: A file that fails analysis
- **WHEN** the analysis of a file ends in a failure that is not a provider outage
- **THEN** the file counts as finished, and the planner runs for the turn with that file marked as failed

#### Scenario: A file held by an outage
- **WHEN** the analysis of a file stopped because its provider is held
- **THEN** the file counts as in flight, and the planner does not run for the turn until the file is analyzed after recovery

### Requirement: Quiet window after the last inbound
The planner SHALL run only after a configured quiet window has passed since the client's most recent inbound webhook. Each new inbound webhook of the same client SHALL restart the window.

#### Scenario: Client keeps sending
- **WHEN** a client sends a second file before the quiet window of the first file has passed
- **THEN** the window restarts from the second file, and the planner has not run in between

### Requirement: Maximum wait
The system SHALL bound the total wait of a turn. When the configured maximum wait has passed since the first inbound of the turn, the planner SHALL run with whatever is finished, and the event SHALL be logged as a warning. While the planner's own provider or a provider the turn's held work needs is held, the maximum wait SHALL NOT force a run: the turn keeps waiting and is planned after recovery.

#### Scenario: Processing hangs
- **WHEN** inbound processing for a client is still marked in flight after the maximum wait and no provider is held
- **THEN** the planner runs once, a warning names the client and the unfinished work, and unfinished files appear to the planner as not yet analyzed

#### Scenario: Maximum wait during a hold
- **WHEN** the maximum wait passes while the planner's provider is held
- **THEN** the planner does not run, the client stays in the waiting state, and the turn is planned once after the hold clears

### Requirement: The outdated pending send is cancelled at once
On every new inbound message, the system SHALL cancel the client's pending scheduled send immediately, without waiting for the turn to settle.

#### Scenario: Reply arrives while a follow-up is scheduled
- **WHEN** a client with a scheduled follow-up sends a message
- **THEN** the scheduled follow-up is cancelled before any file processing starts, and it is never sent

### Requirement: The workspace shows the turn as in progress
From the first inbound webhook of a turn until the planner run for that turn ends, the workspace SHALL show the client as drafting.

#### Scenario: Accountant opens the client during the wait
- **WHEN** the accountant opens the client while the turn is waiting for file analysis
- **THEN** the client shows the drafting state, not an empty schedule

### Requirement: Fast paths skip the wait
An inbound WhatsApp message handled as the tax-authority one-time code SHALL be passed on immediately, with no wait and no planner run. The fixed reply to a message blocked by the injection screen SHALL be sent immediately; the planner run that follows it SHALL obey the turn rules. A message held as unscreened because of a provider outage SHALL get no fixed reply.

#### Scenario: One-time code
- **WHEN** a client with a login waiting for a code sends the code over WhatsApp
- **THEN** the code reaches the fetch session immediately and no deferred planner run is requested

#### Scenario: Blocked message
- **WHEN** the injection screen blocks an inbound message
- **THEN** the fixed reply goes out immediately, and the planner runs later, once, under the turn rules

#### Scenario: Unscreened message
- **WHEN** the injection screen could not run because its provider is held
- **THEN** no fixed reply goes out, and the deferred planner run waits for recovery

### Requirement: A lost deferred run is recovered
The system SHALL NOT leave a client without a planner run because the deferred run was lost (process restart or queue data loss). This covers both the run of an inbound turn and the run that follows a delivered message.

#### Scenario: Worker restarts during the wait
- **WHEN** the worker restarts while a turn is waiting
- **THEN** after the restart the planner still runs once for that turn

#### Scenario: Worker restarts during the after-send delay
- **WHEN** the worker restarts while a client's after-send run is waiting, and that client has no scheduled send, is not paused and is not complete
- **THEN** after the restart the after-send run is requested again for the remaining delay (at once if the delay has already passed)

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
