## MODIFIED Requirements

### Requirement: The agent stops when the window ends
On the first daily overdue scan after the due date has passed (the scan runs just after local midnight, and once at worker boot), a pending, not paused, not admin-paused, non-test client with a passed due date SHALL be paused, marked handed off, and the accountant SHALL receive one email listing the still-missing documents. From then on the agent SHALL send no further message to the client, except the one handoff notice (capability `handoff-notice`): no reminder is scheduled, and a message the client sends afterwards, including a reply to the handoff notice, is stored but not answered. Each due date SHALL trigger this at most once. The accountant SHALL be able to resume the client (the agent chases again, with the same due date and no second email), or set a new due date (the agent chases again and stops again when the new date passes).

#### Scenario: Window ends
- **WHEN** a client's due date is 2026-11-17, the client is still pending and not paused, and the overdue scan runs on 2026-11-18 at 00:10 local time
- **THEN** the client is paused and marked handed off, the pending scheduled message is cancelled, and the accountant gets one email listing the missing documents

#### Scenario: Client writes after the stop
- **WHEN** a handed-off client sends a WhatsApp message with a file
- **THEN** the message and file are stored on the client and no reply is sent

#### Scenario: Client answers the handoff notice
- **WHEN** a handed-off client received the handoff notice and replies "תודה"
- **THEN** the reply is stored on the client and no answer is sent

#### Scenario: Accountant resumes
- **WHEN** the accountant resumes a handed-off client without changing the due date
- **THEN** the agent plans the next message, the handed-off state clears, and the passed due date does not stop the client a second time

#### Scenario: Accountant sets a new due date
- **WHEN** the accountant sets the due date of a handed-off client to a date two weeks ahead
- **THEN** the handed-off state clears, the agent chases again, and the client is stopped once more the night after the new date passes

#### Scenario: Goal completed before the date
- **WHEN** a client's declaration is completed before the due date
- **THEN** the passed due date later triggers nothing
