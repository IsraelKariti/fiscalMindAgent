# client-decline Specification

## Purpose
What happens when a declaration-of-capital client declines the WhatsApp document collection: how the decline is recognised, what the client hears back, how the chase stops, how the accountant is told, how the workspace shows it, and how the accountant can resume.

## Requirements

### Requirement: A decline is recognised from the button or from words
The system SHALL treat an inbound WhatsApp message as a decline when the client tapped the intro template's decline button (the quick-reply payload `decline`, or a message whose whole text equals the decline button's text), without any planner run. When the client instead writes a refusal in their own words (for example "לא תודה", "אני מעדיף להביא את המסמכים למשרד"), the planner SHALL recognise it and answer with the `client_declined` decision and nothing else: no reminder, no explanation, no attempt to persuade. A message that merely asks a question, hesitates, or says "not now" SHALL NOT count as a decline.

#### Scenario: Button tap
- **WHEN** the client taps "לא, אטפל בזה בעצמי" on the intro message
- **THEN** the decline is handled at once, and no planner call is recorded for that turn

#### Scenario: Typed refusal
- **WHEN** the client writes "לא, אני אעביר את המסמכים ישירות למשרד"
- **THEN** the planner answers `client_declined`, and the same decline handling follows

#### Scenario: Hesitation is not a decline
- **WHEN** the client writes "לא עכשיו, תחזור אליי בשבוע הבא"
- **THEN** the planner does not answer `client_declined` and schedules the usual later follow-up

### Requirement: The client hears one fixed acknowledgement
On a decline, the system SHALL send the client one fixed Hebrew acknowledgement, immediately: it says the assistant understood, will stop sending messages, and that the documents can be handed to the office directly, naming the accountant. It SHALL be sent only while the 24-hour window is open (it always is right after the client's message); when it cannot be sent, the decline SHALL still be handled and the reason recorded in the trace. The acknowledgement SHALL appear in the timeline as a sent message, and the trace SHALL show a `send_decline_ack` step.

#### Scenario: Acknowledgement text
- **WHEN** client "ישראל כהן" of accountant "אריה רותם" declines
- **THEN** the client receives one message saying the assistant understood, will stop writing, and that the documents can be delivered directly to the office of רואה החשבון אריה רותם, and the timeline shows it

#### Scenario: No sender available
- **WHEN** the client declines while the instance has no WhatsApp sender
- **THEN** no message is sent, the client is still stopped and the accountant still emailed, and the trace step records why the acknowledgement was skipped

### Requirement: A decline stops the chase and hands the client to the accountant
On a decline the system SHALL pause the client, mark it declined with the time, cancel its pending scheduled send, and send the accountant one email saying that the client declined the WhatsApp collection and will deliver the documents to the office themselves, listing the documents still missing. From then on the agent SHALL send nothing to the client: no reminder is scheduled, and a later message from the client is stored but not answered. A goal already completed SHALL NOT be reopened by a decline. A second decline from an already declined client SHALL change nothing and SHALL NOT email again.

#### Scenario: Decline during collection
- **WHEN** a pending client with 4 missing documents and a reminder scheduled for tomorrow declines
- **THEN** the reminder is cancelled, the client is paused and marked declined, and the accountant gets one email naming the client and the 4 missing documents

#### Scenario: Client writes after declining
- **WHEN** a declined client sends a message a week later
- **THEN** the message is stored on the client and no reply is sent

#### Scenario: Decline twice
- **WHEN** a declined client taps the decline button again
- **THEN** nothing changes and no second email is sent

### Requirement: The workspace shows the declined state and lets the accountant resume
A declined, still-pending client SHALL show in the workspace as handed off because the client declined: the status badge reads that the client declined and the file is in the accountant's hands, the stat tiles and the overview list use the same handed-off styling as an overdue stop, and the dashboard's handed-off count includes declined clients. Resuming the client, or setting a new due date, SHALL clear the declined state and let the agent chase again; a second decline afterwards SHALL be handled (and emailed) again.

#### Scenario: Declined badge
- **WHEN** the accountant opens a declined client
- **THEN** the header badge says the client declined and the file was handed to the accountant, and the overview list shows the handed-off marker

#### Scenario: Resume after decline
- **WHEN** the accountant resumes a declined client
- **THEN** the declined marker clears, the agent plans the next message, and a later decline stops the client and emails the accountant again
