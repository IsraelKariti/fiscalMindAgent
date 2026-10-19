## Purpose
How an admin viewing the workspace as an accountant adds a hand-filled test client to the accountant's agent, and how that client stays visible to admins only.

## ADDED Requirements

### Requirement: The Settings view has an admin-only "test" tab
While an admin views the workspace as an accountant, the workspace Settings view SHALL show one more tab labeled "בדיקה" (test). The tab SHALL be visibly marked as an admin-only tab (an "admin only" marker and a distinct colour from the other tabs). The accountant's own session SHALL NOT show the tab, and a remembered tab choice of "test" SHALL fall back to the general tab when the view is not an admin's view-as session. The tab SHALL hold the test-client form and its submit button.

#### Scenario: Admin sees the tab
- **WHEN** an admin viewing as an accountant opens the agent's Settings view
- **THEN** the tabs are general, connections, test, dashboard, and the test tab carries the admin-only marker

#### Scenario: Accountant does not see the tab
- **WHEN** the accountant opens the agent's Settings view in their own session
- **THEN** no test tab is shown

#### Scenario: Remembered tab after the session ended
- **WHEN** the test tab was the last open tab and the Settings view is next opened in the accountant's own session
- **THEN** the general tab opens

### Requirement: The test-client form takes the identity the kickoff would read from monday
The form SHALL take: name (required), WhatsApp phone (required, must normalise to a valid international number), declaration year (required, four digits, prefilled with the last concluded year), national id (optional), file number (optional), marital status (optional: married / not married), spouse name and spouse id (optional), and zero or more questionnaire answers as question/answer pairs (optional). Submitting SHALL be refused, with the reason shown in the form, when a required field is missing, the phone is not a valid number, the year is not a four-digit year, or a live client of the same instance already has that phone. The refusal SHALL create nothing.

#### Scenario: Valid submit
- **WHEN** the admin fills a name, the phone 052-123-4567 and the year 2025 and submits
- **THEN** a test client is created and the workspace opens on it

#### Scenario: Phone already in use
- **WHEN** the admin submits a phone that a live client of the same agent already has
- **THEN** the form shows "a client with this phone number already exists" and no client is created

#### Scenario: Invalid phone
- **WHEN** the admin submits "abc" as the phone
- **THEN** the form shows that a valid phone number is required and no client is created

### Requirement: Submitting creates a test client that behaves like a kickoff client
Submitting SHALL create a client on the accountant's agent instance marked as a test client, paused, with the declaration year on its record, the full catalog checklist seeded for that year, the id, file number, spouse and marital status stored as the kickoff stores them, and the questionnaire answers stored and pre-resolved onto the checklist exactly as the monday kickoff does. The first message SHALL then be drafted and held with the client paused, as for a kickoff client (the `first-message-approval` capability). The system SHALL NOT read or write any monday board for a test client. The creation SHALL be recorded as a `client.test_created` audit event with the real admin as the actor, the agent instance and the client. The accountant's session SHALL NOT be able to create a test client: the request is refused as admin-only.

#### Scenario: Created paused with a held draft
- **WHEN** a test client is created
- **THEN** the workspace shows it paused, with every catalog item in intake state for its year, and shortly after a drafted first message with the paused note and a Resume button

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

### Requirement: A test client is invisible to the accountant
A test client SHALL NOT appear in the accountant's client list, the dashboard summaries and activity, the file counts, the admin agent-roster client counts, or the overdue roster. The accountant's session SHALL NOT be able to open a test client by its link or act on it: every such request is answered "client not found". The daily import scan SHALL treat a source row whose phone matches a test client as already enrolled (no second client with that phone).

#### Scenario: Accountant's list
- **WHEN** an agent has 5 live clients of which 2 are test clients and the accountant opens the workspace
- **THEN** the list and the dashboard show 3 clients

#### Scenario: Accountant follows a test client's link
- **WHEN** the accountant opens the workspace link of a test client
- **THEN** the workspace answers "client not found"

#### Scenario: Admin roster count
- **WHEN** the admin panel lists the agent
- **THEN** its client count excludes test clients

### Requirement: The admin sees and works test clients under view-as
While an admin views the workspace as the accountant, the client list SHALL include the test clients, each marked with a clear admin-only "test client" badge and a distinct look, and the admin SHALL be able to open and act on a test client (resume, reply, documents, pause, rename, WhatsApp, delete) exactly as on a live client. Inbound WhatsApp messages from the test client's phone SHALL be routed to the test client as for any live client. A deleted test client SHALL appear in the admin's deleted list with the same badge.

#### Scenario: Badge in the list
- **WHEN** an admin viewing as the accountant looks at the client list
- **THEN** each test client shows the "test client" badge and no live client does

#### Scenario: Admin resumes the test client
- **WHEN** the admin resumes the test client's held first message
- **THEN** the message is sent to the test client's phone as for any client

#### Scenario: Reply from the test phone
- **WHEN** a WhatsApp message arrives from the test client's phone
- **THEN** it is stored on the test client and processed as any inbound message
