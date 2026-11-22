## MODIFIED Requirements

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

### Requirement: Maximum wait
The system SHALL bound the total wait of a turn. When the configured maximum wait has passed since the first inbound of the turn, the planner SHALL run with whatever is finished, and the event SHALL be logged as a warning. While the planner's own provider or a provider the turn's held work needs is held, the maximum wait SHALL NOT force a run: the turn keeps waiting and is planned after recovery.

#### Scenario: Processing hangs
- **WHEN** inbound processing for a client is still marked in flight after the maximum wait and no provider is held
- **THEN** the planner runs once, a warning names the client and the unfinished work, and unfinished files appear to the planner as not yet analyzed

#### Scenario: Maximum wait during a hold
- **WHEN** the maximum wait passes while the planner's provider is held
- **THEN** the planner does not run, the client stays in the waiting state, and the turn is planned once after the hold clears

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
