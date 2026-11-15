## ADDED Requirements

### Requirement: The list can be narrowed to the signed-in person's own clients
Above the search box the sidebar SHALL show a "my clients only" checkbox whenever the loaded list holds at least one client whose stored tax advisor email equals the signed-in person's email, compared ignoring letter case. When no client in the loaded list is assigned to the signed-in person, the checkbox SHALL NOT be shown. When ticked, the list SHALL show only the assigned clients, and the search box and the color buttons SHALL apply to those clients only. The checkbox SHALL be ticked when the page opens for a staff viewer and unticked for the accountant; the choice SHALL NOT be kept across page reloads. The checkbox SHALL carry a hover text saying it keeps only the clients whose tax advisor is the signed-in person. The behaviour SHALL be the same in the standalone app and in the monday custom object.

#### Scenario: Viewer opens the workspace
- **WHEN** a staff viewer whose email is the advisor of 3 of the accountant's 10 clients opens the workspace
- **THEN** the checkbox is shown ticked and the list shows those 3 clients

#### Scenario: Viewer unticks
- **WHEN** that viewer unticks the checkbox
- **THEN** the list shows all 10 clients

#### Scenario: Accountant with own clients
- **WHEN** the accountant, who is the advisor of 2 clients, opens the workspace
- **THEN** the checkbox is shown unticked and the list shows every client; ticking it shows the 2 clients

#### Scenario: Nobody assigned to the signed-in person
- **WHEN** an admin viewing as the accountant, or a viewer who is the advisor of no client, opens the workspace
- **THEN** no checkbox is shown and the list shows every client

#### Scenario: Letter case
- **WHEN** a client's advisor email is "Dana@Office.co.il" and the viewer signed in as "dana@office.co.il"
- **THEN** that client counts as the viewer's own

#### Scenario: Search within own clients
- **WHEN** the checkbox is ticked and the viewer types a name that only a client of another advisor has
- **THEN** the list shows the "no client matches" message

## MODIFIED Requirements

### Requirement: The list can be narrowed to one dot color
Between the search box and the client list, the sidebar SHALL show one bar of five buttons of which exactly one is pressed: "הכל" with the number of clients in the loaded list, then a blue, a green, an orange and a red button, each showing its dot and the number of clients whose dot has that color. "הכל" SHALL be pressed when the page opens. Pressing a color button SHALL show only the clients whose dot has that color; pressing "הכל" SHALL show every client. The pressed button SHALL be visibly distinct from the others. Each color button SHALL carry a hover text naming its meaning: in progress; all documents received; the due date passed with documents missing; the client refused. The counts SHALL count the loaded list (live clients, or deleted clients when that list is shown) after the "my clients only" narrowing when that checkbox is ticked, and SHALL NOT change with the search text. A button whose count is zero SHALL still be shown and pressable, and the list then shows the empty-result message. The choice SHALL NOT be kept across page reloads.

#### Scenario: Only refused clients
- **WHEN** the accountant presses the red button
- **THEN** the list shows only the clients whose dot is red, and the red button is shown pressed

#### Scenario: Only window-ended clients
- **WHEN** the accountant presses the orange button
- **THEN** the list shows only the clients whose due date passed with documents still missing, and the orange button is shown pressed

#### Scenario: Back to all
- **WHEN** the red button is pressed and the accountant presses "הכל"
- **THEN** the list shows every client again

#### Scenario: Counts
- **WHEN** the loaded list has 8 clients: 4 in progress, 2 complete, 1 stopped at the window's end and 1 refused
- **THEN** the buttons read "הכל 8", blue 4, green 2, orange 1, red 1

#### Scenario: Counts with own clients only
- **WHEN** the "my clients only" checkbox is ticked and 3 of those 8 clients are the signed-in person's, 2 in progress and 1 complete
- **THEN** the buttons read "הכל 3", blue 2, green 1, orange 0, red 0

#### Scenario: Empty color
- **WHEN** no client is refused and the accountant presses the red button
- **THEN** the list shows the "no client matches" message and the red button stays pressed
