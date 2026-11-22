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

### Requirement: The outdated pending send is cancelled at once
On every new inbound message, the system SHALL cancel the client's pending scheduled send immediately, without waiting for the turn to settle.

#### Scenario: Reply arrives while a follow-up is scheduled
- **WHEN** a client with a scheduled follow-up sends a message
- **THEN** the scheduled follow-up is cancelled before any file processing starts, and it is never sent

### Requirement: The workspace shows the turn as in progress
The workspace SHALL show what the agent is doing for a client whose goal is open, and nothing when it is only waiting:

- **Processing**: from the first inbound webhook of a turn while the inputs are being handled (media stored, files split and classified, documents verified), the conversation timeline SHALL show a "processing" notice (the agent is processing the received messages and files). The notice SHALL stay fresh for the whole analysis, however many files the turn has.
- **Nothing**: while the agent only waits for a timer — the quiet window after the client's last inbound with no analysis in flight, or the delay after the agent's own delivered message — the timeline SHALL end at the last message: no processing notice, no drafting notice, no waiting sentence, no retry control.
- **Drafting**: while a planner run writes the message (the deferred run, a manual redraft or regenerate, the held first message), the timeline SHALL show the "drafting" notice as today.
- **Stuck**: when a processing or drafting notice has been shown for more than 3 minutes without a fresh stamp, or when the goal is open, nothing is scheduled, no planner run is queued or running and nothing has happened for 3 minutes, the timeline SHALL show the "stuck" notice with the manual Retry, as today. "Failed" and "held by the system" SHALL keep their notices.

The workspace SHALL NOT infer "drafting" from an open goal with nothing scheduled. The client read of the workspace API SHALL carry the due time of the client's queued planner run (a turn waiting for its quiet window, or an after-send wait), or none, so every viewer tells a timer wait from a lost run.

#### Scenario: Accountant opens the client during the wait
- **WHEN** the accountant opens the client while the turn is waiting for file analysis
- **THEN** the client shows the processing notice, not an empty schedule and not a drafting notice

#### Scenario: Client sends a text, quiet window of 125 seconds
- **WHEN** a client sends "hi" and the agent has nothing else to analyze
- **THEN** the timeline shows nothing after the message for the quiet window, then the drafting notice while the planner runs, then the scheduled reply

#### Scenario: Client sends five files
- **WHEN** a client sends five PDFs and their split, classification and verification take four minutes
- **THEN** the timeline shows the processing notice for those four minutes (never "stuck", because every file refreshes the stamp), then the drafting notice while the planner writes the reply

#### Scenario: Accountant opens the client during the after-send wait
- **WHEN** the agent's message was delivered and the hour-long after-send wait is running
- **THEN** the timeline ends at the delivered message with no notice

#### Scenario: Queued run lost
- **WHEN** the queue lost the client's deferred run and nothing happens for 3 minutes
- **THEN** the timeline shows the stuck notice with Retry, and Retry plans at once

#### Scenario: Manual redraft
- **WHEN** the accountant presses "redraft"
- **THEN** the timeline shows the drafting notice at once, until the new draft is scheduled

### Requirement: The workspace shows the after-send wait
While a client's planner run is waiting out the after-send delay (the agent's message was delivered, the client has not replied, and the deferred run has not started), the workspace SHALL NOT show the client as drafting: the conversation timeline SHALL end at the delivered message, with no drafting placeholder, no waiting sentence, no "stuck" notice, no error wording and no retry control, however long the wait is. The client read of the workspace API SHALL carry the time the deferred run is due, so every viewer of the client (accountant, staff viewer, admin viewing as) sees the same silent state. When the wait ends and the planner starts, the workspace SHALL show the drafting state as today; when the client replies inside the wait, the workspace SHALL show the turn as in progress as today.

#### Scenario: Accountant opens the client during the wait
- **WHEN** the agent's message was delivered at 19:01 with a one-hour delay and the accountant opens the client at 19:10
- **THEN** the timeline ends at the 19:01 message: no drafting placeholder, no waiting sentence, no "stuck" notice and no Retry button

#### Scenario: The wait passes
- **WHEN** the page is open when 20:01 arrives and the planner run starts
- **THEN** the page refreshes by itself and shows the drafting placeholder until the next message is scheduled

#### Scenario: Client replies during the wait
- **WHEN** the client replies at 19:30
- **THEN** the timeline shows the reply and the drafting state of the inbound turn

#### Scenario: The queued run is lost
- **WHEN** the queue lost the deferred run (queue data loss) and the worker has not yet recovered it
- **THEN** the client read carries no due time and the workspace falls back to today's behaviour (drafting placeholder, then the stuck notice with Retry)

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
The system SHALL NOT leave a client without a planner run because the deferred run was lost (process restart or queue data loss). This covers both the run of an inbound turn and the run that follows a delivered message. A lost turn SHALL be recognized by either activity stamp (processing or drafting) that is recent and has nothing scheduled.

#### Scenario: Worker restarts during the wait
- **WHEN** the worker restarts while a turn is waiting
- **THEN** after the restart the planner still runs once for that turn

#### Scenario: Worker restarts during file analysis
- **WHEN** the worker restarts while a client's files are being analyzed (processing stamped, nothing scheduled)
- **THEN** after the restart the planner still runs once for that turn

#### Scenario: Worker restarts during the after-send delay
- **WHEN** the worker restarts while a client's after-send wait is running
- **THEN** after the restart the after-send run is requested again for the remaining delay (at once if the delay has already passed)

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
