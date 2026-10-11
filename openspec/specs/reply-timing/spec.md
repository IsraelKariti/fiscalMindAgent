# reply-timing Specification

## Purpose
Defines when the agent's follow-up message leaves: the model chooses, per reply, between an immediate send and a scheduled wall-clock time, under stated conditions, and the platform honours an immediate send through the same gates as a scheduled one.

## Requirements

### Requirement: A follow-up answer may ask for an immediate send
A follow-up planning answer SHALL carry either a wall-clock send time in the accountant's timezone or the immediate-send marker. The system SHALL accept the marker only on a follow-up answer; a collecting answer and a goal-complete answer SHALL still carry no send time at all, and the system SHALL reject them if they carry the marker, asking the model for one corrected answer as it does for any other contract violation.

#### Scenario: Follow-up with the immediate-send marker
- **WHEN** the planner answers follow_up with a full message and the immediate-send marker instead of a time
- **THEN** the answer passes the decision gate and the code sets the send time to one second after the planning cycle ends

#### Scenario: Collecting answer with the marker
- **WHEN** the planner ties a file to a document and also sets the immediate-send marker
- **THEN** the answer is rejected as a contract violation and the model is asked for one corrected answer

### Requirement: An immediate send leaves as soon as the existing gates pass
For a draft marked for immediate send the code SHALL pick the send time itself, one second after the moment the answer is accepted, and SHALL then schedule the draft exactly as it schedules a draft with a model-chosen time. It SHALL pass through the same gates as a scheduled draft: a review-mode instance holds it until an admin approves; a held first message stays held until the accountant resumes; the WhatsApp window check at send time applies unchanged. The weekend and holiday roll-forward SHALL NOT apply to an immediate send.

#### Scenario: Active client, no review mode
- **WHEN** a client wrote a minute ago, the planner answers with an immediate send, and the instance is not in review mode
- **THEN** the reply is sent right after the planning cycle ends, with no waiting for a whole-minute send time

#### Scenario: Active client on a review-mode instance
- **WHEN** the planner answers with an immediate send on an instance in review mode
- **THEN** the draft is stored as awaiting review with a planned time of now, and it is sent when the admin approves it, through the past-due approval flow

#### Scenario: Immediate send on a Saturday
- **WHEN** a client writes on Saturday and the planner answers with an immediate send
- **THEN** the reply is sent at once and is not rolled forward to Sunday

### Requirement: The model chooses immediate send only for a waiting client
The planner prompt SHALL instruct the model to mark a reply for immediate send only when the client is active right now and is waiting for the answer: the client wrote within the last few minutes and the message answers what they wrote, or the reply reports the result of files the client just sent (the reply after verification). The prompt SHALL instruct the model to choose a wall-clock time instead when the client signalled they need a moment ("I'm looking for it now, I'll answer soon"), when the message is a reminder or any proactive message (including the first message to a new client), when the client has been silent for more than a short while, and when the next message is the check-in while waiting for a verification code.

#### Scenario: Client asks a question and waits
- **WHEN** the last message in the thread is from the client, sent a minute ago, and asks which document is needed
- **THEN** the planner's answer carries the immediate-send marker

#### Scenario: Client says they are looking for the document
- **WHEN** the client's last message says they are looking for the document now and will send it soon
- **THEN** the planner's answer carries a wall-clock time that gives the client room, not the immediate-send marker

#### Scenario: Reply after verification
- **WHEN** the client sent files a few minutes ago and the planner writes the reply that reports the verification results
- **THEN** the planner's answer carries the immediate-send marker

#### Scenario: Reminder
- **WHEN** the last message in the thread is the agent's own and the client has not answered
- **THEN** the planner's answer carries a wall-clock time, not the immediate-send marker

### Requirement: The trace records the immediate-send choice
The send_reply step of the conversation trace and the planner log SHALL record that the model asked for an immediate send and the time the code picked, so an admin reading the trace can tell an immediate send from a scheduled one.

#### Scenario: Reading the trace
- **WHEN** an admin opens the send_reply step of a reply the model marked for immediate send
- **THEN** the step shows the immediate-send marker as the request and the picked time as the send time

### Requirement: Evals accept and pin the immediate-send choice
The planner eval stage SHALL treat the immediate-send marker as a valid future send time, and a case MAY pin whether the answer must or must not carry the marker.

#### Scenario: Case pins an immediate send
- **WHEN** a generate_message case expects an immediate send and the model answers with a wall-clock time
- **THEN** the case fails on the send-timing check
