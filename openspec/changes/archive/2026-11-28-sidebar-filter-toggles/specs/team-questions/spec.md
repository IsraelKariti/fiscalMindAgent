## MODIFIED Requirements

### Requirement: The sidebar shows open questions
In the client list a client with an open question SHALL carry a small question badge on its row, with a hover text saying the agent is waiting for the team's answer. Above the list the sidebar SHALL show a "questions from the agent" toggle whenever at least one client in the loaded list has an open question, whoever the question is addressed to; the toggle SHALL NOT be shown when no client has an open question. The toggle SHALL read "שאלות מהסוכן" next to the question badge and SHALL NOT show a number. Its hover text SHALL say that it keeps only the clients the agent has an open question about. Pressing the toggle SHALL narrow the list to every client that carries the badge and SHALL be pressable again to show every client; a pressed toggle SHALL look pressed. When the "my clients" toggle of the `client-search` capability is pressed too, the list SHALL show only the signed-in person's own clients that have an open question. The search box and the color buttons SHALL apply within the narrowed list. The toggle SHALL sit on one row with the "my clients" toggle, each of the two taking half of the row width; a toggle shown alone SHALL keep its own half. The badge and the toggle SHALL consider open questions of live clients only and SHALL update when the roster refreshes. The behaviour SHALL be the same in the standalone app and in the monday custom object.

#### Scenario: Viewer with two open questions
- **WHEN** a staff viewer who is the addressee of two open questions opens the workspace
- **THEN** the toggle reads "שאלות מהסוכן" with no number, both client rows carry the badge, and pressing the toggle lists those two clients

#### Scenario: Accountant with none addressed to them
- **WHEN** the accountant opens a workspace where the only open question is addressed to a staff member
- **THEN** the client row carries the badge, the toggle is shown, and pressing it lists that client

#### Scenario: Question answered
- **WHEN** the last open question in the loaded list is answered
- **THEN** the badge leaves the row and the toggle disappears on the next roster refresh

#### Scenario: Questions addressed to several people
- **WHEN** four clients have an open question, one addressed to the signed-in person and three to other staff members, and the viewer presses the toggle
- **THEN** the list shows all four clients

#### Scenario: Both toggles pressed
- **WHEN** four clients have an open question, two of them are the signed-in person's own clients, and both toggles are pressed
- **THEN** the list shows those two clients

#### Scenario: Both toggles pressed with no common client
- **WHEN** both toggles are pressed and none of the signed-in person's own clients has an open question
- **THEN** the list shows the "no client matches" message and both toggles stay shown and pressed

#### Scenario: Both toggles shown
- **WHEN** at least one client has an open question and the signed-in person is the advisor of at least one client
- **THEN** the "שאלות מהסוכן" toggle and the "הלקוחות שלי" toggle sit on one row and have the same width

#### Scenario: Pressed again
- **WHEN** the viewer presses the pressed toggle a second time
- **THEN** the toggle no longer looks pressed and the list shows every client
