## Purpose

Defines how a client of an agent instance is identified, what deleting a client does and keeps, how a deleted client behaves for message routing, work in flight and re-adding the same person, and how the admin can still see deleted clients.

## ADDED Requirements

### Requirement: A client is identified by its own id; email and phone are unique among live clients only
Every client SHALL be identified by its own id for its whole life, including after deletion. Within one agent instance, no two live (not deleted) clients SHALL share an email address (compared case-insensitively) or a WhatsApp phone number. A deleted client SHALL NOT count toward that rule: its email address and WhatsApp phone number are free for a new client of the same instance. The deleted client SHALL keep its own email address and phone number on its record.

#### Scenario: Two live clients with the same email
- **WHEN** an accountant adds a client with the email of a live client of the same agent
- **THEN** the add is refused with the existing "a client with this email already exists" message and no client is created

#### Scenario: Two live clients with the same phone
- **WHEN** an accountant adds a client with the WhatsApp phone of a live client of the same agent
- **THEN** the add is refused with the existing "a client with this phone already exists" message and no client is created

#### Scenario: Same email as a deleted client
- **WHEN** an accountant adds a client with the email of a client that was deleted earlier
- **THEN** a new client is created with a new id, an empty conversation and an empty document list, and the deleted client's record is unchanged

#### Scenario: Same phone as a deleted client
- **WHEN** an accountant adds a client with the WhatsApp phone of a deleted client
- **THEN** a new client is created with that phone as its WhatsApp number, with a new id and an empty history

### Requirement: Deleting a client keeps its record and all its data
When an accountant (or an admin viewing as the accountant) deletes a client, the system SHALL mark the client deleted with the deletion time and the acting user, and SHALL keep the client's record, conversation, documents, files, stored file contents, tax-fetch sessions, LLM calls and audit links unchanged. The deletion SHALL cancel the client's pending scheduled send, as today. The deletion SHALL NOT remove any stored file. The delete confirmation SHALL tell the accountant that the client leaves the list, that messages, documents and files are kept for the records, and that a client with the same phone or email can be added again as a new client; it SHALL NOT say that the data is erased. Deleting a client SHALL be recorded as a `client.deleted` audit event naming the acting user (the admin when viewing as), the agent instance and the client.

#### Scenario: Delete keeps the data
- **WHEN** an accountant deletes a client that has 12 messages, 5 documents and 3 files
- **THEN** the client disappears from the accountant's list, and the 12 messages, 5 documents, 3 files and their stored contents still exist on the deleted record

#### Scenario: Pending send is cancelled
- **WHEN** an accountant deletes a client whose next message is scheduled for tomorrow
- **THEN** the scheduled send is cancelled and that message is never sent

#### Scenario: Delete is audited
- **WHEN** an admin viewing as an accountant deletes one of the accountant's clients
- **THEN** a `client.deleted` audit event is recorded with the admin as the actor, the agent instance and the client

#### Scenario: Deleting twice
- **WHEN** a delete request arrives for a client that is already deleted
- **THEN** the request is answered as "client not found" and the record is unchanged

#### Scenario: Account deletion still erases
- **WHEN** an accountant deletes their own account
- **THEN** all their clients, deleted ones included, are erased with the account, as today

### Requirement: A deleted client is outside the roster
A deleted client SHALL NOT appear in the accountant's client list, the dashboard summaries, the admin client counts, the overdue scan or any other roster. A deleted client SHALL NOT be found by email or phone: an inbound WhatsApp message from its number SHALL be treated as a message from an unknown number (ignored) unless a live client of the same instance has that number, in which case it SHALL be routed to that live client. The daily import scan and the monday kickoff SHALL treat a board row whose email or phone matches only a deleted client as a new, not-yet-enrolled row.

#### Scenario: Message from a deleted client's phone
- **WHEN** a WhatsApp message arrives from the phone of a deleted client and no live client of that agent has that phone
- **THEN** the message is ignored as coming from an unknown number, nothing is stored on the deleted record, and no LLM call runs

#### Scenario: Message after re-adding
- **WHEN** a client with the phone of a deleted client was added again, and a WhatsApp message arrives from that phone
- **THEN** the message is routed to the new client only

#### Scenario: Kickoff on a deleted client's board row
- **WHEN** the accountant triggers the monday kickoff on a board row whose phone matches only a deleted client
- **THEN** a new client is enrolled from that row, with a new id and its own document list, and its first message is drafted as for any new client

#### Scenario: Import scan after deletion
- **WHEN** the daily import scan reads a source row whose key matches only a deleted client
- **THEN** the row is treated as not yet enrolled (enrolled, or left for the kickoff, exactly as a never-seen row would be)

#### Scenario: Counts exclude deleted clients
- **WHEN** an agent has 10 clients of which 3 are deleted
- **THEN** the admin agent roster shows 7 clients and the accountant's dashboard lists 7

### Requirement: Work in flight on a deleted client stops
Any work that re-reads its client after the client was deleted (a planner run, a scheduled send, a re-plan, a tax fetch, the send resync at boot, the attestation or closing message) SHALL find no live client and SHALL end without sending, writing documents, or recording a message on the deleted record. An error log line is acceptable; a message to the client is not.

#### Scenario: Planner finishes after delete
- **WHEN** a planner run is in progress for a client and the accountant deletes the client before the run writes its reply
- **THEN** no reply is sent and no reply is stored on the deleted record

#### Scenario: Boot resync
- **WHEN** the service restarts with a scheduled-send row that belongs to a deleted client
- **THEN** the send is not re-queued

### Requirement: Writes to a deleted client are refused
Rename, pause and resume, WhatsApp toggle, due date, document list actions, kickoff, retry send, and every other change to a deleted client SHALL be refused with "client not found". Only reading is allowed, and only for an admin (next requirement).

#### Scenario: Resume a deleted client
- **WHEN** a request tries to resume a deleted client
- **THEN** it is refused with "client not found" and the record is unchanged

### Requirement: The admin can see deleted clients, read-only
While an admin views the workspace as an accountant, the client list SHALL offer a "deleted clients" toggle. With the toggle on, the list SHALL show the accountant's deleted clients, each with its deletion date, newest deletion first. Opening a deleted client SHALL show its conversation, documents, files and trace exactly as recorded, with a banner stating the deletion date and the acting user, and with no action controls (no reply, pause, resume, rename, WhatsApp, document or delete actions). The accountant's own workspace SHALL NOT offer the toggle, and the accountant SHALL NOT be able to open a deleted client by its link. A deleted client's files and the step and call modals SHALL open for the admin as for a live client.

#### Scenario: Admin lists deleted clients
- **WHEN** an admin viewing as an accountant turns the "deleted clients" toggle on
- **THEN** the list shows the accountant's deleted clients with their deletion dates, and live clients are hidden until the toggle is turned off

#### Scenario: Admin opens a deleted client
- **WHEN** the admin opens a deleted client from that list
- **THEN** the conversation, documents, files and trace show as recorded, a banner states when and by whom the client was deleted, and no action control is shown

#### Scenario: Accountant follows a deleted client's link
- **WHEN** an accountant (not an admin) opens the workspace link of a deleted client
- **THEN** the workspace answers "client not found"

#### Scenario: File of a deleted client
- **WHEN** the admin opens a file step of a deleted client
- **THEN** the modal shows the document beside the details, as for a live client
