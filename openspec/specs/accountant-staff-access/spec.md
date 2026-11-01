# accountant-staff-access Specification

## Purpose

Who an accountant may let into their workspace besides themselves: the list of employee email addresses the accountant keeps, how such an employee signs in, what a signed-in employee can see and download, what they can never change, and how removal from the list takes effect.

## Requirements

### Requirement: The accountant keeps a list of staff email addresses
An accountant SHALL be able to keep a list of email addresses of people who may view the accountant's workspace. Each entry SHALL hold one email address, compared case-insensitively. The list SHALL be managed from a "Staff" tab on the workspace Settings page, which SHALL show every entry with its email, the date it was added, and whether that person has signed in yet. The tab SHALL offer an add control and, per entry, a remove control behind an in-app confirmation styled by the app, never a browser popup. An admin viewing the workspace as the accountant SHALL be able to manage the list in the same way.

#### Scenario: Adding an employee
- **WHEN** an accountant enters a valid email address in the Staff tab and confirms
- **THEN** the address appears in the list, marked as not signed in yet, with today's date

#### Scenario: Admin viewing as the accountant
- **WHEN** an admin viewing the workspace as an accountant opens the Settings page
- **THEN** the Staff tab is shown and adding or removing an entry works as for the accountant

#### Scenario: Removing an employee
- **WHEN** the accountant chooses remove on an entry and confirms in the in-app dialog
- **THEN** the entry disappears from the list

#### Scenario: Cancelling the removal
- **WHEN** the accountant chooses remove on an entry and closes the dialog without confirming
- **THEN** the entry stays in the list and nothing changes

### Requirement: Addresses that cannot be staff
The system SHALL refuse to add an address that is already in use in a way that conflicts with the staff role, with a message naming the reason: the accountant's own address; an address already on another accountant's staff list; an address that is an activated accountant; an address that is an admin. An address already on this accountant's list SHALL be refused as a duplicate. A malformed address SHALL be refused.

#### Scenario: Own address
- **WHEN** an accountant tries to add their own sign-in email
- **THEN** the add is refused with a message saying this is the account's own address

#### Scenario: Staff of another accountant
- **WHEN** accountant B tries to add an address that is already on accountant A's staff list
- **THEN** the add is refused with a message saying the address already belongs to another account's staff, and accountant A's list is unchanged

#### Scenario: Activated accountant
- **WHEN** an accountant tries to add the sign-in email of another activated accountant
- **THEN** the add is refused with a message saying that address is an accountant account

#### Scenario: Duplicate
- **WHEN** an accountant adds an address that is already on their own list, in different letter case
- **THEN** the add is refused as a duplicate and the list keeps one entry

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
### Requirement: A viewer can view and download documents
In a client's documents tab, a viewer SHALL be able to open a file in the viewer and download it, for every file the accountant could view or download.

#### Scenario: Download
- **WHEN** a viewer chooses download on a file in the documents tab
- **THEN** the file is downloaded as it would be for the accountant

#### Scenario: Inline view
- **WHEN** a viewer chooses view on a file
- **THEN** the file opens in the in-app viewer as it would for the accountant

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

### Requirement: A viewer sees only the dashboard in Settings
For a viewer, the Settings page SHALL show only the agent dashboard tab. The general tab (connections and mailbox), the agent settings tab, the admin test tab and the Staff tab SHALL NOT be shown, and their data SHALL NOT be served to a viewer.

#### Scenario: Settings for a viewer
- **WHEN** a viewer opens Settings
- **THEN** the dashboard is shown and no other tab exists

#### Scenario: Staff list request from a viewer
- **WHEN** a request to read or change the staff list arrives under a viewer's session
- **THEN** it is refused as read-only and the list is neither shown nor changed

### Requirement: Removal takes effect on the next request
After the accountant removes an address from the list, every later request under that person's session, from the standalone app or from the monday object, SHALL be refused as not activated, and the surface SHALL show the "account not activated" screen on its next load, as it does for an unactivated accountant. Data already loaded in an open tab is not recalled.

#### Scenario: Removed while signed in
- **WHEN** a viewer has the workspace open, the accountant removes their address, and the viewer then opens another client
- **THEN** the request is refused, and reloading the page shows the "account not activated" screen

#### Scenario: Removed while open in monday
- **WHEN** a viewer has the custom object open in monday, the accountant removes their address, and the viewer then opens another client
- **THEN** the request is refused, and reloading the object shows the "account not activated" screen

#### Scenario: Added again
- **WHEN** a removed address is added to the list again and the person signs in
- **THEN** the accountant's workspace opens for them as a viewer

### Requirement: Staff changes are audited
Adding an address to the staff list and removing one SHALL each be recorded in the audit trail with the acting user (the admin when viewing as the accountant) as the actor, the accountant as the target, and the address in the detail.

#### Scenario: Add is audited
- **WHEN** an accountant adds an address
- **THEN** the audit trail holds an entry naming the accountant as actor and target and the address added

#### Scenario: Remove by an admin is audited
- **WHEN** an admin viewing as the accountant removes an address
- **THEN** the audit trail holds an entry with the admin as the actor, the accountant as the target and the address removed

### Requirement: The admin panel tells a staff member apart from a waiting user
In the admin panel's accountants list, a signed-in user whose address is on an accountant's staff list SHALL be labelled as staff of that accountant, not as a user waiting for activation.

#### Scenario: Staff member in the list
- **WHEN** an employee has signed in once and an admin opens the accountants list
- **THEN** that user's row says they are staff of the named accountant and does not show the waiting-for-activation badge
