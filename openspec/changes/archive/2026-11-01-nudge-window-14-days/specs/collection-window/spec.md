## Purpose
Defines how long the agent chases a client for documents: a per-agent collection window that turns into a due date on the client at first contact, how the accountant can override it per client, and what happens when the window ends.

## ADDED Requirements

### Requirement: Each agent instance has a collection window
Every agent instance SHALL carry a collection window, a whole number of days between 1 and 365, with a default of 14 for new and existing instances. An admin SHALL be able to read and change the window on the agent's admin page. A change SHALL apply to clients whose first message is delivered after the change; clients that already carry a due date SHALL keep it. The accountant's workspace SHALL NOT offer a control for the window.

#### Scenario: New instance
- **WHEN** an admin activates the agent for an accountant without touching the window
- **THEN** the instance's collection window is 14 days

#### Scenario: Admin changes the window
- **WHEN** an admin sets the window of an instance to 21 days
- **THEN** the admin page shows 21, and the next client whose first message is delivered gets a due date 21 days after that delivery

#### Scenario: Value out of range
- **WHEN** an admin submits a window of 0 or 400 days
- **THEN** the request is refused as invalid and the stored window is unchanged

### Requirement: First contact sets the client's due date from the window
When the agent's first outbound message to a client is delivered, and the client carries no collection due date, the system SHALL set the client's collection due date to the delivery date in the accountant's timezone plus the instance's collection window. The due date SHALL be the same due date the accountant can set by hand: it SHALL show in the client's due-date chip and tiles, be editable and clearable, and be passed to the planner as the collection deadline. A due date the accountant set before first contact SHALL NOT be replaced. The automatic date SHALL be set only once, at first contact: later messages SHALL NOT set it again, and a due date the accountant cleared afterwards SHALL stay cleared.

#### Scenario: First message delivered, no manual date
- **WHEN** a client was added on 2026-11-01 with no due date, the window is 14 days, and the agent's first message is delivered on 2026-11-03 (accountant's local date)
- **THEN** the client's due date becomes 2026-11-17 and the workspace shows it in the due-date chip

#### Scenario: Held first message
- **WHEN** a monday kickoff client's first message was drafted on 2026-11-03 and held, and the accountant resumes the client on 2026-11-10 so the message is delivered that day
- **THEN** the due date is counted from 2026-11-10, not from the draft date

#### Scenario: Accountant set a date first
- **WHEN** the accountant added the client with due date 2026-12-31 and the first message is delivered on 2026-11-03 with a 14-day window
- **THEN** the due date stays 2026-12-31

#### Scenario: Accountant clears the date later
- **WHEN** the due date was set from the window at first contact and the accountant later clears it
- **THEN** the client has no due date, the next messages do not set one again, and the agent keeps chasing with no deadline

#### Scenario: Day boundary in local time
- **WHEN** the first message is delivered at 23:30 Israel time on 2026-11-03 (which is 21:30 UTC)
- **THEN** the due date is counted from 2026-11-03, the local date

### Requirement: The agent paces reminders toward the due date
While the client's due date has not passed, the planner SHALL see the due date and the days left as the collection deadline and SHALL pace reminders toward it, as it does today for a hand-set date. The deadline SHALL NOT make the planner send more often than the proactive-message rules allow.

#### Scenario: Deadline in the prompt
- **WHEN** the planner runs for a client whose due date is 12 days away
- **THEN** the planning input states the due date and that 12 days are left

### Requirement: The agent stops when the window ends
On the first daily overdue scan after the due date has passed (the scan runs just after local midnight, and once at worker boot), a pending, not paused, not admin-paused, non-test client with a passed due date SHALL be paused, marked handed off, and the accountant SHALL receive one email listing the still-missing documents. From then on the agent SHALL send no further message to the client: no reminder is scheduled, and a message the client sends afterwards is stored but not answered. Each due date SHALL trigger this at most once. The accountant SHALL be able to resume the client (the agent chases again, with the same due date and no second email), or set a new due date (the agent chases again and stops again when the new date passes).

#### Scenario: Window ends
- **WHEN** a client's due date is 2026-11-17, the client is still pending and not paused, and the overdue scan runs on 2026-11-18 at 00:10 local time
- **THEN** the client is paused and marked handed off, the pending scheduled message is cancelled, and the accountant gets one email listing the missing documents

#### Scenario: Client writes after the stop
- **WHEN** a handed-off client sends a WhatsApp message with a file
- **THEN** the message and file are stored on the client and no reply is sent

#### Scenario: Accountant resumes
- **WHEN** the accountant resumes a handed-off client without changing the due date
- **THEN** the agent plans the next message, the handed-off state clears, and the passed due date does not stop the client a second time

#### Scenario: Accountant sets a new due date
- **WHEN** the accountant sets the due date of a handed-off client to a date two weeks ahead
- **THEN** the handed-off state clears, the agent chases again, and the client is stopped once more the night after the new date passes

#### Scenario: Goal completed before the date
- **WHEN** a client's declaration is completed before the due date
- **THEN** the passed due date later triggers nothing

### Requirement: Clients contacted before the window existed are not changed
A client whose first message was delivered before this behaviour was deployed and who carries no due date SHALL keep having no due date; the accountant can set one by hand as today.

#### Scenario: Old client
- **WHEN** the behaviour is deployed while a client contacted a month ago is still pending with no due date
- **THEN** that client gets no due date and keeps being chased as before
