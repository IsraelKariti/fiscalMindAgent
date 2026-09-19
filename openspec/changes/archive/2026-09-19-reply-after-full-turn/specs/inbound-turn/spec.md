## Purpose

Defines when the planner runs after inbound client activity: the messages and files a client sends close together form one turn, and the agent writes one reply for the turn, only after all processing of that turn is finished.

## ADDED Requirements

### Requirement: One planner run per client turn
The system SHALL group the inbound messages and files a client sends close together into one turn, and SHALL run the planner once for the turn. An inbound webhook SHALL NOT run the planner by itself.

#### Scenario: Text and several files sent together
- **WHEN** a client sends one text message and four files within a few seconds, delivered as five separate webhooks
- **THEN** the planner runs exactly once, and its input holds the text message and the analysis results of all four files

#### Scenario: Single message
- **WHEN** a client sends one text message and nothing else
- **THEN** the planner runs once, after the quiet window has passed

### Requirement: The planner waits for all inbound processing
The planner SHALL NOT run for a client while any inbound processing for that client is in flight. Inbound processing covers the file download, the injection screens of the message and of each file, file splitting, and the classification of every file and every split child.

#### Scenario: A slow file
- **WHEN** a client sends a text message and a large PDF, and the PDF is still being split and classified after the quiet window has passed
- **THEN** no planner run and no draft happen until the PDF and all of its child files have an analysis result

#### Scenario: A file that fails analysis
- **WHEN** the analysis of a file ends in a failure
- **THEN** the file counts as finished, and the planner runs for the turn with that file marked as failed

### Requirement: Quiet window after the last inbound
The planner SHALL run only after a configured quiet window has passed since the client's most recent inbound webhook. Each new inbound webhook of the same client SHALL restart the window.

#### Scenario: Client keeps sending
- **WHEN** a client sends a second file before the quiet window of the first file has passed
- **THEN** the window restarts from the second file, and the planner has not run in between

### Requirement: Maximum wait
The system SHALL bound the total wait of a turn. When the configured maximum wait has passed since the first inbound of the turn, the planner SHALL run with whatever is finished, and the event SHALL be logged as a warning.

#### Scenario: Processing hangs
- **WHEN** inbound processing for a client is still marked in flight after the maximum wait
- **THEN** the planner runs once, a warning names the client and the unfinished work, and unfinished files appear to the planner as not yet analyzed

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
An inbound WhatsApp message handled as the tax-authority one-time code SHALL be passed on immediately, with no wait and no planner run. The fixed reply to a message blocked by the injection screen SHALL be sent immediately; the planner run that follows it SHALL obey the turn rules.

#### Scenario: One-time code
- **WHEN** a client with a login waiting for a code sends the code over WhatsApp
- **THEN** the code reaches the fetch session immediately and no deferred planner run is requested

#### Scenario: Blocked message
- **WHEN** the injection screen blocks an inbound message
- **THEN** the fixed reply goes out immediately, and the planner runs later, once, under the turn rules

### Requirement: A lost deferred run is recovered
The system SHALL NOT leave a client without a planner run because the deferred run was lost (process restart or queue data loss).

#### Scenario: Worker restarts during the wait
- **WHEN** the worker restarts while a turn is waiting
- **THEN** after the restart the planner still runs once for that turn
