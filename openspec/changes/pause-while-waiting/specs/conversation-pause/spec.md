## Purpose

When the accountant can stop and restart the agent's outreach to a client from the conversation tab, what pausing does to a client that has nothing scheduled, and what resuming does afterwards.

## ADDED Requirements

### Requirement: Pause is available whenever the goal is open
The conversation tab SHALL offer a pause control for a client whose goal is open and who is not paused, in every state of the agent's turn: a scheduled message, a message being drafted, inputs being processed, a queued run waiting for its quiet window or after-send delay, or nothing at all. The scheduled-message bubble SHALL keep its own pause control as today; when no scheduled bubble carries one (nothing is scheduled, or the scheduled draft is held for admin review), the pause control SHALL appear in the header row of the conversation timeline, beside the message count, and SHALL NOT add a row to the timeline. The control SHALL NOT appear for a paused client, a completed goal, or a deleted client. A staff viewer and an admin viewing as the accountant SHALL see the control wherever the accountant sees it.

#### Scenario: Agent waits for the client's reply
- **WHEN** the agent's message was delivered, nothing is scheduled and the client has not replied
- **THEN** the timeline header shows a pause control and the timeline still ends at the delivered message

#### Scenario: A message is scheduled
- **WHEN** a message is scheduled for later
- **THEN** the scheduled bubble carries the pause control as today and the header shows none

#### Scenario: The scheduled draft is held for admin review
- **WHEN** the scheduled draft awaits the admin's approval
- **THEN** neither the bubble nor the header shows a pause control

#### Scenario: Client already paused
- **WHEN** the client is paused
- **THEN** the header shows no pause control and the timeline shows the paused notice with its Resume button

#### Scenario: Deleted client or completed goal
- **WHEN** an admin opens a deleted client, or anyone opens a client whose goal is complete
- **THEN** no pause control is shown anywhere

#### Scenario: Staff viewer
- **WHEN** a staff viewer opens a client whose agent waits for a reply
- **THEN** the header shows the pause control and pressing it pauses the client exactly as for the accountant

### Requirement: Pausing a client with nothing scheduled stops the agent
Pausing a client with nothing scheduled SHALL mark the client paused at once and SHALL change nothing else: no message is sent, no message is drafted for the client, and a queued planner run that later fires SHALL schedule nothing. A message or file the client sends while paused SHALL be stored and shown in the timeline, and SHALL NOT be answered. Right after the pause the timeline SHALL show the paused notice with its Resume button, and the header pause control SHALL disappear. The pause SHALL be recorded as the same client update as a pause from the scheduled bubble, so every open view of the client refreshes.

#### Scenario: Pause while waiting for a reply
- **WHEN** the accountant presses the header pause control while the agent waits for the client's reply
- **THEN** the client is paused, the timeline shows the paused notice with Resume, and nothing is sent or drafted

#### Scenario: Client replies while paused
- **WHEN** the client sends a message after the pause
- **THEN** the message appears in the timeline, the agent does not answer, and the paused notice stays

#### Scenario: After-send run fires while paused
- **WHEN** the queued after-send planner run becomes due while the client is paused
- **THEN** nothing is drafted or scheduled and the client stays paused

#### Scenario: Pause while the agent is drafting
- **WHEN** the accountant pauses while the "drafting" notice is shown
- **THEN** the planner run finishes without scheduling a send, and the timeline then shows the paused notice with Resume

### Requirement: Resume after a pause with no preserved draft re-plans
Resuming a paused client that has no preserved scheduled message SHALL hand the client back to the agent: the agent plans again from the client's current state (the messages and files received meanwhile included) and drafts its next message, which is scheduled as any planned message is. The timeline SHALL show the drafting notice while this happens and then the scheduled message. A preserved scheduled message SHALL be restored on resume exactly as today.

#### Scenario: Resume after a pause while waiting
- **WHEN** the accountant resumes a client that was paused while the agent waited for a reply
- **THEN** the timeline shows the drafting notice, then the next scheduled message

#### Scenario: Resume after the client replied during the pause
- **WHEN** the client sent two files during the pause and the accountant resumes
- **THEN** the agent's next draft takes the two files into account
