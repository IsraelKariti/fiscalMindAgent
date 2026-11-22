## MODIFIED Requirements

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
