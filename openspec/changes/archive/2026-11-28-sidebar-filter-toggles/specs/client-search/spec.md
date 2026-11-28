## MODIFIED Requirements

### Requirement: The list can be narrowed to the signed-in person's own clients
Above the search box the sidebar SHALL show a "my clients" toggle whenever the loaded list holds at least one client whose stored tax advisor email equals the signed-in person's email, compared ignoring letter case. The toggle SHALL read "הלקוחות שלי" after a small person icon, and SHALL have the same look as the "questions from the agent" toggle of the `team-questions` capability; the two SHALL sit on one row, each taking half of the row width, and a toggle shown alone SHALL keep its own half. Under admin view-as, the accountant being viewed counts as the signed-in person, so the admin sees the toggle the accountant would see. When no client in the loaded list is assigned to that person, the toggle SHALL NOT be shown. When pressed, the toggle SHALL look pressed, the list SHALL show only the assigned clients, and the search box and the color buttons SHALL apply to those clients only. The toggle SHALL be pressed when the page opens for a staff viewer and not pressed for the accountant; the choice SHALL NOT be kept across page reloads. The toggle SHALL carry a hover text saying it keeps only the clients whose tax advisor is the signed-in person. The behaviour SHALL be the same in the standalone app and in the monday custom object.

#### Scenario: Viewer opens the workspace
- **WHEN** a staff viewer whose email is the advisor of 3 of the accountant's 10 clients opens the workspace
- **THEN** the toggle is shown pressed and the list shows those 3 clients

#### Scenario: Viewer unticks
- **WHEN** that viewer presses the pressed toggle
- **THEN** the toggle no longer looks pressed and the list shows all 10 clients

#### Scenario: Accountant with own clients
- **WHEN** the accountant, who is the advisor of 2 clients, opens the workspace
- **THEN** the toggle is shown not pressed and the list shows every client; pressing it shows the 2 clients

#### Scenario: Nobody assigned to the signed-in person
- **WHEN** a viewer who is the advisor of no client opens the workspace
- **THEN** no "my clients" toggle is shown and the list shows every client

#### Scenario: Admin viewing as the accountant
- **WHEN** an admin views the workspace as an accountant who is the advisor of 1 client
- **THEN** the toggle is shown not pressed, and pressing it shows that 1 client

#### Scenario: Letter case
- **WHEN** a client's advisor email is "Dana@Office.co.il" and the viewer signed in as "dana@office.co.il"
- **THEN** that client counts as the viewer's own

#### Scenario: Search within own clients
- **WHEN** the toggle is pressed and the viewer types a name that only a client of another advisor has
- **THEN** the list shows the "no client matches" message

#### Scenario: Text and icon
- **WHEN** the toggle is shown
- **THEN** it reads "הלקוחות שלי" with a person icon before the text and without the word "בלבד"
