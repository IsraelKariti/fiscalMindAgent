## MODIFIED Requirements

### Requirement: The workspace shows the turn as in progress
The workspace SHALL show what the agent is doing for a client whose goal is open, and nothing when it is only waiting:

- **Processing**: from the first inbound webhook of a turn while the inputs are being handled (media stored, files split and classified, documents verified), the conversation timeline SHALL show a "processing" notice (the agent is processing the received messages and files). The notice SHALL stay fresh for the whole analysis, however many files the turn has.
- **Nothing**: while the agent only waits for a timer — the quiet window after the client's last inbound with no analysis in flight, or the delay after the agent's own delivered message — the timeline SHALL end at the last message: no processing notice, no drafting notice, no waiting sentence, no retry control.
- **Drafting**: while a planner run writes the message (the deferred run, a manual redraft or regenerate, the held first message), the timeline SHALL show the "drafting" notice as today.
- **Stuck**: when a processing or drafting notice has been shown for more than 3 minutes without a fresh stamp, or when the goal is open, nothing is scheduled, no planner run is queued or running and nothing has happened for 3 minutes, the timeline SHALL show the "stuck" notice with the manual Retry, as today. "Failed" and "held by the system" SHALL keep their notices.
- **Handed off**: when the client is paused because it was handed to the accountant (the collection due date passed, or the client declined), the timeline SHALL show the handed-off notice for that cause with its Resume control, and SHALL NOT show the "failed", "stuck" or "held by the system" notice or a Retry control, even when a planner attempt failed, stalled or was held before the hand-off.

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

#### Scenario: Due date passes after a failed draft
- **WHEN** the last planner attempt for a client failed, and the overdue scan later pauses the client because its due date passed
- **THEN** the timeline shows the "due date passed, agent stopped" notice with Resume, and no "drafting failed" notice and no Retry button

#### Scenario: Client declines after a failed draft
- **WHEN** the last planner attempt for a client failed, and the client then declines the collection
- **THEN** the timeline shows the declined notice with Resume, and no "drafting failed" notice and no Retry button

#### Scenario: Accountant resumes a handed-off client with a stale failure
- **WHEN** the accountant resumes a client whose due date passed after a failed draft
- **THEN** the agent re-plans at once and the timeline shows the drafting notice, then the scheduled message
