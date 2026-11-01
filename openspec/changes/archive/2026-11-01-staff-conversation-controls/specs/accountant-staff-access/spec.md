## ADDED Requirements

### Requirement: A viewer may drive a client's conversation
A signed-in staff viewer SHALL be able to take the conversation-flow actions on any client of the accountant's workspace that the accountant could take, on every sign-in surface: pause the agent's outreach, resume it (including the resume that releases the held first message and so starts the conversation), send the waiting message now, retry a failed send, and retry or regenerate a draft. Each such request under a viewer's session SHALL be handled exactly as under the accountant's session, with the same confirmations, warnings and results. The workspace SHALL show the viewer those controls wherever the accountant sees them.

#### Scenario: Starting a conversation
- **WHEN** a viewer opens a client whose first message is held and chooses resume
- **THEN** the same confirmation the accountant would see appears, and on confirming, the held first message is released as it would be for the accountant

#### Scenario: Pausing
- **WHEN** a viewer chooses pause on a client with a scheduled message
- **THEN** the client is paused and the scheduled message is held, exactly as for the accountant

#### Scenario: Resuming
- **WHEN** a viewer chooses resume on a paused client
- **THEN** the client resumes exactly as for the accountant, including the late-send warning when the planned time has passed

#### Scenario: Send now
- **WHEN** a viewer chooses send now on a scheduled message and confirms
- **THEN** the message is sent as it would be for the accountant

#### Scenario: Retry after a failure
- **WHEN** a viewer chooses retry send on a failed send, or retry draft on a failed or stalled draft
- **THEN** the retry runs as it would for the accountant

#### Scenario: Regenerating a draft
- **WHEN** a viewer chooses regenerate on a scheduled draft
- **THEN** the draft is regenerated as it would be for the accountant

#### Scenario: From the monday object
- **WHEN** any of the above requests arrives from the monday custom object under a viewer's session
- **THEN** it is handled exactly as under a Google session

#### Scenario: Deleted client
- **WHEN** a viewer looks at a deleted client
- **THEN** no conversation-flow control is shown, as none is for the accountant

## MODIFIED Requirements

### Requirement: A listed employee signs in as a read-only viewer of the accountant's workspace
When a person reaches the workspace using an address on an accountant's staff list, on any sign-in surface (Google sign-in in the standalone app, or the FiscalMind custom object inside monday), the system SHALL open that accountant's workspace for them as a viewer: the same agents, client list, client conversations, documents tab and agent dashboard the accountant sees, with the test client and deleted clients excluded as they are for the accountant. The workspace SHALL state plainly that the viewer is looking at the named accountant's account, that they may start, pause and resume conversations, and that they cannot change anything else. The viewer's own session SHALL be used; no sharing of the accountant's login is needed. The surfaces SHALL agree: an address that is a viewer under Google sign-in is a viewer in the monday object, and one refused in the standalone app is refused in monday.

#### Scenario: First sign-in
- **WHEN** an employee whose address was added by the accountant signs in with Google for the first time
- **THEN** the accountant's workspace opens, lists the accountant's clients, and shows a notice naming the accountant and saying the viewer may start, pause and resume conversations but cannot change anything else

#### Scenario: Opening the monday object
- **WHEN** a monday user whose monday email is on an accountant's staff list opens the FiscalMind custom object
- **THEN** the accountant's workspace opens inside monday, lists the accountant's clients, and shows the same notice naming the accountant, instead of the "account not activated" screen

#### Scenario: First contact through monday
- **WHEN** a person whose address is on a staff list has never signed in anywhere and opens the FiscalMind custom object in monday first
- **THEN** the accountant's workspace opens for them as a viewer, and a later Google sign-in with the same address reaches the same viewer access

#### Scenario: Write from the monday object
- **WHEN** a request that would change data, other than a conversation-flow action, arrives from the monday object under a viewer's session
- **THEN** it is refused as read-only and nothing changes, exactly as under a Google session

#### Scenario: Reading a conversation
- **WHEN** a viewer opens a client
- **THEN** the full conversation is shown, including scheduled and sent messages, exactly as the accountant would see it

#### Scenario: Address not on any list
- **WHEN** a person signs in with an address that is on no staff list and is not an activated accountant or admin
- **THEN** they see the existing "account not activated" screen, as today, on both surfaces

### Requirement: A viewer cannot change anything
Apart from the conversation-flow actions (pause, resume, send now, retry send, retry or regenerate a draft), the server SHALL refuse every request from a viewer that would change data: adding, editing or deleting a client, changing a client's WhatsApp setting or due date, acting on a document row, adding a document, approving a draft under admin review, changing settings or connections, and managing the staff list. The refusal SHALL be an "access is read-only" error that changes nothing. The workspace SHALL NOT show a viewer any of those controls; where the accountant sees such a control, the viewer sees nothing in its place.

#### Scenario: Delete request from a viewer
- **WHEN** a request to delete a client arrives under a viewer's session
- **THEN** the request is refused as read-only and the client is unchanged

#### Scenario: Document action from a viewer
- **WHEN** a request to approve, remove or mark a document row arrives under a viewer's session
- **THEN** the request is refused as read-only and the row is unchanged

#### Scenario: Edit request from a viewer
- **WHEN** a request to edit a client's details, WhatsApp setting or due date arrives under a viewer's session
- **THEN** the request is refused as read-only and the client is unchanged

#### Scenario: Client screen for a viewer
- **WHEN** a viewer opens a client
- **THEN** there is no edit or delete control, no WhatsApp toggle, no due-date edit, no approve-draft control, and the document rows show no actions menu and no add-document control, while the pause, resume, send now, retry and regenerate controls appear where the accountant would see them

#### Scenario: Sidebar for a viewer
- **WHEN** a viewer looks at the client list
- **THEN** there is no add-client control
