## MODIFIED Requirements

### Requirement: The sidebar shows open questions
In the client list a client with an open question SHALL carry a small question badge on its row, with a hover text saying the agent is waiting for the team's answer. Above the list the sidebar SHALL show a "questions from the agent" toggle whenever at least one client in the loaded list has an open question, whoever the question is addressed to; the toggle SHALL NOT be shown when no client has an open question. The toggle SHALL read "שאלות מהסוכן" next to the question badge and SHALL NOT show a number. Its hover text SHALL say that it keeps only the clients the agent has an open question about. Pressing the toggle SHALL narrow the list to every client that carries the badge and SHALL be pressable again to show every client; a pressed toggle SHALL look pressed. When the tax advisor picker of the `client-search` capability has a choice other than "הכל", the list SHALL show only the picked advisor's clients that have an open question. The search box and the color buttons SHALL apply within the narrowed list. The toggle SHALL sit on one row with the tax advisor picker button, each of the two taking half of the row width; one shown alone SHALL keep its own half. The badge and the toggle SHALL consider open questions of live clients only and SHALL update when the roster refreshes. The behaviour SHALL be the same in the standalone app and in the monday custom object.

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
- **WHEN** four clients have an open question, one addressed to the signed-in person and three to other staff members, the picker's choice is "הכל", and the viewer presses the toggle
- **THEN** the list shows all four clients

#### Scenario: Both toggles pressed
- **WHEN** four clients have an open question, two of them are the signed-in person's own clients, the toggle is pressed and the picker's choice is "אני"
- **THEN** the list shows those two clients

#### Scenario: Toggle pressed with a colleague picked
- **WHEN** four clients have an open question, one of them is advised by "דנה שמש", the toggle is pressed and "דנה שמש" is picked
- **THEN** the list shows that one client

#### Scenario: Both toggles pressed with no common client
- **WHEN** the toggle is pressed and none of the picked advisor's clients has an open question
- **THEN** the list shows the "no client matches" message, the toggle stays shown and pressed, and the picker keeps its choice

#### Scenario: Both toggles shown
- **WHEN** at least one client has an open question and at least one client has a stored tax advisor
- **THEN** the "שאלות מהסוכן" toggle and the tax advisor picker button sit on one row and have the same width

#### Scenario: Pressed again
- **WHEN** the viewer presses the pressed toggle a second time
- **THEN** the toggle no longer looks pressed and the list shows every client the picker's choice allows
