## Purpose

How a manual-kickoff client's first message reaches the client only after the accountant has read it: the kickoff drafts the message but keeps the client paused, and the accountant's resume is what sends it, at the planned time or immediately when that time has passed.

## ADDED Requirements

### Requirement: The kickoff drafts the first message and keeps the client paused
When the monday kickoff fires for a never-contacted, paused, goal-open manual-kickoff client, the system SHALL run the questionnaire intake as today, have the agent draft the first message, store the draft with its planned send time, and keep the client paused. NO send SHALL be queued. The timeline SHALL show the draft exactly as a paused scheduled message is shown today (its text, the paused note with the planned time, a Resume button). The kickoff audit and the monday status sync SHALL stay as they are today; nothing on the monday board changes.

#### Scenario: Kickoff
- **WHEN** the accountant clicks the kickoff button on a never-contacted, paused client's board row
- **THEN** the agent drafts the first message, the client stays paused, nothing is sent, and the timeline shows the draft with the paused note and a Resume button

#### Scenario: Repeat kickoff
- **WHEN** the kickoff fires again for a client whose first draft already exists, is being written, or was already sent
- **THEN** the system acknowledges the event and changes nothing

#### Scenario: Drafting fails for good
- **WHEN** every drafting attempt of the held first message fails
- **THEN** the client stays paused with no draft, the timeline shows the paused notice with a Resume button, and a later resume starts the conversation with a fresh draft as today

### Requirement: Resume sends the preserved draft, at its time or immediately with a warning
When the accountant resumes a client that has a preserved draft, the system SHALL send that draft at its planned time when that time is still ahead. When the planned time has passed, the workspace SHALL first show an in-app modal (never a browser dialog) that explains, in Hebrew, that the planned time has passed and the message will be sent immediately on resume, with confirm and cancel. The client SHALL be resumed only after the accountant confirms, and the system SHALL then send the **same** preserved draft right away; it SHALL NOT draft a new message. The past-due check SHALL be made at click time. This rule applies to every resume of a client with a preserved draft, first message or later follow-up alike.

#### Scenario: Planned time still ahead
- **WHEN** the accountant resumes a held first message whose planned time is in one hour
- **THEN** no modal is shown, and that message is sent in one hour

#### Scenario: Planned time passed
- **WHEN** the accountant resumes a held first message two days after it was drafted
- **THEN** the modal explains the message will be sent immediately; on confirm the same drafted text is sent within seconds; on cancel the client stays paused and nothing is sent

#### Scenario: Time passes while the page is open
- **WHEN** the planned time passed after the page was loaded and the accountant then clicks Resume
- **THEN** the modal is shown (the check uses the current time at click)

#### Scenario: Later follow-up resumed late
- **WHEN** the accountant resumes a mid-conversation client whose preserved follow-up's planned time has passed
- **THEN** the same modal is shown and, on confirm, that preserved follow-up is sent immediately

### Requirement: A reply before the first message refreshes the held draft
While the first message is held, an inbound WhatsApp message or file from the client SHALL be stored and processed as today, and the deferred re-plan that follows SHALL replace the held draft with a fresh one that accounts for the inbound turn, still held with the client paused. Nothing SHALL be sent until the accountant resumes.

#### Scenario: Client writes first
- **WHEN** a client whose first message is held sends a WhatsApp message
- **THEN** the message appears in the timeline, nothing is sent to the client, and the timeline shows a re-drafted first message, still paused
