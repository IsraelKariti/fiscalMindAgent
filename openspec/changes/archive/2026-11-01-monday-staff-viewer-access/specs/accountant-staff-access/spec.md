## MODIFIED Requirements

### Requirement: A listed employee signs in as a read-only viewer of the accountant's workspace
When a person reaches the workspace using an address on an accountant's staff list, on any sign-in surface (Google sign-in in the standalone app, or the FiscalMind custom object inside monday), the system SHALL open that accountant's workspace for them as a viewer: the same agents, client list, client conversations, documents tab and agent dashboard the accountant sees, with the test client and deleted clients excluded as they are for the accountant. The workspace SHALL state plainly that the viewer is looking at the named accountant's account in read-only mode. The viewer's own session SHALL be used; no sharing of the accountant's login is needed. The surfaces SHALL agree: an address that is a viewer under Google sign-in is a viewer in the monday object, and one refused in the standalone app is refused in monday.

#### Scenario: First sign-in
- **WHEN** an employee whose address was added by the accountant signs in with Google for the first time
- **THEN** the accountant's workspace opens, lists the accountant's clients, and shows a notice naming the accountant and saying the view is read-only

#### Scenario: Opening the monday object
- **WHEN** a monday user whose monday email is on an accountant's staff list opens the FiscalMind custom object
- **THEN** the accountant's workspace opens inside monday, lists the accountant's clients, and shows the notice naming the accountant and saying the view is read-only, instead of the "account not activated" screen

#### Scenario: First contact through monday
- **WHEN** a person whose address is on a staff list has never signed in anywhere and opens the FiscalMind custom object in monday first
- **THEN** the accountant's workspace opens for them as a viewer, and a later Google sign-in with the same address reaches the same viewer access

#### Scenario: Write from the monday object
- **WHEN** a request that would change data arrives from the monday object under a viewer's session
- **THEN** it is refused as read-only and nothing changes, exactly as under a Google session

#### Scenario: Reading a conversation
- **WHEN** a viewer opens a client
- **THEN** the full conversation is shown, including scheduled and sent messages, exactly as the accountant would see it

#### Scenario: Address not on any list
- **WHEN** a person signs in with an address that is on no staff list and is not an activated accountant or admin
- **THEN** they see the existing "account not activated" screen, as today, on both surfaces

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
