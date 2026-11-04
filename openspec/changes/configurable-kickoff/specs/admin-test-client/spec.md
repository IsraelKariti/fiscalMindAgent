## MODIFIED Requirements

### Requirement: Submitting creates a test client that behaves like a kickoff client
Submitting SHALL create a client on the accountant's agent instance marked as a test client, with the declaration year on its record, the full catalog checklist seeded for that year, the id, file number, spouse and marital status stored as the kickoff stores them, and the questionnaire answers stored and pre-resolved onto the checklist exactly as the monday kickoff does. The client's paused state and the fate of its first message SHALL follow the instance's first-message approval setting exactly as for a kickoff client (the `first-message-approval` capability): with approval on, the client is created paused and the first message is drafted and held; with approval off, the client is created not paused and the first message is drafted and queued for its planned time. The system SHALL NOT read or write any monday board for a test client. The creation SHALL be recorded as a `client.test_created` audit event with the real admin as the actor, the agent instance and the client. The accountant's session SHALL NOT be able to create a test client: the request is refused as admin-only.

#### Scenario: Created paused with a held draft
- **WHEN** a test client is created on an instance whose first-message approval is on
- **THEN** the workspace shows it paused, with every catalog item in intake state for its year, and shortly after a drafted first message with the paused note and a Resume button

#### Scenario: Created running with a scheduled first message
- **WHEN** a test client is created on an instance whose first-message approval is off
- **THEN** the workspace shows it not paused, with every catalog item in intake state for its year, and shortly after a drafted first message shown as scheduled, with no Resume button

#### Scenario: Questionnaire answers pre-resolve the checklist
- **WHEN** the admin adds the answer "no" to the question "do you have a vehicle?" and submits
- **THEN** the vehicle item is pre-resolved as the kickoff would resolve it from a monday questionnaire

#### Scenario: No monday side effects
- **WHEN** a test client is created on an agent whose monday boards are configured
- **THEN** no board row is read, created or updated

#### Scenario: Audit
- **WHEN** an admin creates a test client while viewing as an accountant
- **THEN** the audit trail holds a `client.test_created` entry with the admin as the actor, the agent instance and the client

#### Scenario: Accountant calls the route
- **WHEN** a request to create a test client arrives from the accountant's own session
- **THEN** it is refused as admin-only and no client is created
