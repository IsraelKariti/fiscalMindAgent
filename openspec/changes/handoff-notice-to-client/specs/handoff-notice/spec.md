## Purpose

Defines the one fixed WhatsApp message a client receives after the agent stopped the conversation because the collection window ended: when it is sent, what it says, which tax advisor it names, and when it is skipped.

## ADDED Requirements

### Requirement: A stopped client is told on the next business morning
A client the agent stopped because the collection due date passed SHALL receive one handoff notice on WhatsApp. The notice SHALL be sent at 09:00 in the accountant's timezone on the first business day that starts after the stop; the day of the stop itself counts when the stop happened before 09:00 of a business day. A business day SHALL be a Sunday to Thursday that is neither a holiday nor a holiday eve in the calendar the agent uses for proactive messages. The notice SHALL be sent at most once per stop. A client stopped more than 7 days ago SHALL NOT receive a notice.

#### Scenario: Window ends on a weekday
- **WHEN** a client's due date is Tuesday 2026-12-01 and the overdue scan stops the client on Wednesday 2026-12-02 at 00:10
- **THEN** the client receives the handoff notice on Wednesday 2026-12-02 at 09:00

#### Scenario: Window ends before the weekend
- **WHEN** a client's due date is Thursday 2026-12-03 and the overdue scan stops the client on Friday 2026-12-04 at 00:10
- **THEN** no notice is sent on Friday or Saturday, and the client receives it on Sunday 2026-12-06 at 09:00

#### Scenario: Next day is a holiday
- **WHEN** a client is stopped on the night before a holiday eve that is followed by a two-day holiday
- **THEN** the notice is sent at 09:00 on the first day after the holiday that is not a Friday or Saturday

#### Scenario: Worker was down at 09:00
- **WHEN** the worker was not running at 09:00 on the business day after the stop and runs again the same afternoon
- **THEN** no notice is sent that afternoon, and the client receives it at 09:00 on the next business day

#### Scenario: Sent once
- **WHEN** a client received the handoff notice and the 09:00 job runs again the next business day
- **THEN** the client receives nothing

#### Scenario: Stopped long ago
- **WHEN** this behaviour is deployed while a client stopped three weeks earlier is still handed off
- **THEN** that client receives no notice

### Requirement: The notice is a fixed template
The notice SHALL be the approved `handoff` template `finish_conversation`, sent as a template whether the client's 24-hour window is open or closed. No LLM call SHALL write, choose or check the notice, and it SHALL NOT wait for an admin's message approval. Its three variables SHALL be the client's first name, the tax advisor's name, and the tax advisor's email address. The sent notice SHALL appear in the client's timeline as a sent outbound message with the full rendered text, and SHALL be recorded in the audit trail as a sent template.

#### Scenario: Notice text
- **WHEN** the notice is sent to client "ישראל ישראלי" whose stored tax advisor is "דנה לוי" with email dana@office.example
- **THEN** the message greets ישראל, says the document collection on WhatsApp has ended and the conversation is closed, says the documents are forwarded to tax advisor דנה לוי, gives dana@office.example for questions and further documents, and thanks the client for the cooperation

#### Scenario: Window open
- **WHEN** the client wrote two hours before the notice is due
- **THEN** the same template is sent, not a free-form text

#### Scenario: Timeline
- **WHEN** the accountant opens the timeline of a client who received the notice
- **THEN** the notice shows as a sent message with the names and the email filled in

### Requirement: The notice names the client's tax advisor
The notice SHALL name the tax advisor stored on the client when that advisor has an email address, whether or not the advisor matched the staff list. When the client has no stored advisor, or the stored advisor has no email address, the notice SHALL name the accountant instead: the accountant's display name as the client already hears it, and the accountant's sign-in email.

#### Scenario: Advisor on file
- **WHEN** the client's stored advisor has a name and an email
- **THEN** the notice names that advisor and that email

#### Scenario: No advisor on file
- **WHEN** the client was added by hand and has no stored advisor
- **THEN** the notice names the accountant and the accountant's email

#### Scenario: Advisor without an email
- **WHEN** the client's stored advisor has a name but no email
- **THEN** the notice names the accountant and the accountant's email

### Requirement: The notice is skipped when the stop no longer holds
The notice SHALL be sent only to a client that, at send time, is still paused and still marked stopped by the collection window. A client the accountant resumed, a client that got a new due date, a client whose goal is complete, a deleted client, and a client handed off because the client declined SHALL NOT receive the notice. While the platform kill switch is on, or while an admin has paused the agent's communications for the client, the notice SHALL NOT be sent, and SHALL be sent on a later business morning once the block is lifted, within the 7 days.

#### Scenario: Accountant resumes before the morning
- **WHEN** a client is stopped on Friday at 00:10 and the accountant resumes the client on Saturday evening
- **THEN** no notice is sent on Sunday

#### Scenario: New due date before the morning
- **WHEN** the accountant gives a stopped client a new due date two weeks ahead before the notice is sent
- **THEN** no notice is sent now, and a notice is sent after the stop that follows the new date

#### Scenario: Declined client
- **WHEN** a client declined the WhatsApp collection and is handed off for that reason
- **THEN** the client receives no handoff notice

#### Scenario: Admin pause
- **WHEN** an admin paused communications on Wednesday and lifts the pause on Thursday afternoon, for a client stopped on Wednesday at 00:10
- **THEN** no notice is sent on Wednesday or Thursday, and the client receives it on Sunday at 09:00

### Requirement: A notice that cannot be sent is tried again
When the client cannot receive the notice (no WhatsApp number, no sender on the agent, or no `handoff` template registered), or the provider rejects the send, the system SHALL record the reason in the log, SHALL leave the stop and the accountant's email as they are, and SHALL try again on the following business mornings until the stop is 7 days old. A notice that was sent SHALL NOT be sent again because of a later failure.

#### Scenario: Provider rejects the send
- **WHEN** the provider rejects the notice on Sunday at 09:00
- **THEN** the client stays stopped, the failure is logged, and the notice is tried again on Monday at 09:00

#### Scenario: Template not registered yet
- **WHEN** no `handoff` template is registered and a stopped client is due for the notice
- **THEN** nothing is sent, the log names the missing template, and the client is tried again on the next business morning

### Requirement: A second stop sends a second notice
When a client that already received a notice is stopped again by a later due date, the client SHALL receive a new notice for the new stop. A client that was resumed without a new due date is not stopped again and SHALL NOT receive a second notice.

#### Scenario: New due date after a notice
- **WHEN** a client received the notice, the accountant set a new due date, and that date passed
- **THEN** the client is stopped again and receives a notice on the next business morning

#### Scenario: Resume after a notice
- **WHEN** a client received the notice and the accountant resumes the client without a new due date
- **THEN** the agent talks to the client again and no second notice is sent
