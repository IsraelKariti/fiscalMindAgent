## RENAMED Requirements

- FROM: `### Requirement: The list can be narrowed to the signed-in person's own clients`
- TO: `### Requirement: The list can be narrowed to one tax advisor's clients`

## MODIFIED Requirements

### Requirement: The list can be narrowed to one tax advisor's clients
Above the search box the sidebar SHALL show a tax advisor picker button whenever the loaded list holds at least one client with a stored tax advisor; when no client in the loaded list has a stored tax advisor, the button SHALL NOT be shown. The button SHALL sit on one row with the "questions from the agent" toggle of the `team-questions` capability and SHALL have the same look; each of the two SHALL take half of the row width, and one shown alone SHALL keep its own half.

Pressing the button SHALL open a picker drawn by the app (never a browser popup) with one option per line, in this order: "הכל"; "אני"; then every other tax advisor, ordered alphabetically by name. The other tax advisors SHALL be the people stored as tax advisor on at least one client of the loaded list, each listed once by name. Two clients name the same advisor when their stored advisor emails are equal ignoring letter case; an advisor stored without an email is told apart by name. The signed-in person SHALL NOT be repeated among the other advisors. "אני" SHALL be listed even when the signed-in person is the advisor of no client. The current choice SHALL be marked in the picker. Picking an option SHALL close the picker; pressing Escape or pressing outside the picker SHALL close it without changing the choice.

With "הכל" chosen the list SHALL show every client. With "אני" chosen the list SHALL show only the clients whose stored tax advisor email equals the signed-in person's email, compared ignoring letter case. With another advisor chosen the list SHALL show only that advisor's clients. A client with no stored tax advisor SHALL be shown only under "הכל". The search box and the color buttons SHALL apply to the narrowed list only.

The button SHALL show a small person icon and the current choice: "כל היועצים" for "הכל", "הלקוחות שלי" for "אני", and the advisor's name otherwise; a text too long for the button SHALL be cut with an ellipsis. The button SHALL look pressed whenever the choice is not "הכל". The button SHALL carry a hover text saying it picks whose clients are listed.

Under admin view-as, the accountant being viewed counts as the signed-in person. When the page opens the choice SHALL be "אני" for a staff viewer who is the advisor of at least one client in the loaded list, and "הכל" for everybody else. The choice SHALL NOT be kept across page reloads. When the chosen advisor is no longer the advisor of any client in the loaded list, the choice SHALL return to "הכל". The behaviour SHALL be the same in the standalone app and in the monday custom object.

#### Scenario: Order of the options
- **WHEN** the loaded list has clients whose advisors are "רונית לוי", "אבי כהן", "דנה שמש" and the signed-in person, and the viewer presses the button
- **THEN** the picker lists "הכל", "אני", "אבי כהן", "דנה שמש", "רונית לוי" in that order

#### Scenario: Picking a colleague
- **WHEN** the accountant has 10 clients, 4 of them advised by "דנה שמש", and the viewer picks "דנה שמש"
- **THEN** the picker closes, the list shows those 4 clients, and the button reads "דנה שמש" and looks pressed

#### Scenario: Viewer unticks
- **WHEN** "דנה שמש" is chosen and the viewer picks "הכל"
- **THEN** the list shows all 10 clients, the button reads "כל היועצים" and does not look pressed

#### Scenario: Viewer opens the workspace
- **WHEN** a staff viewer whose email is the advisor of 3 of the accountant's 10 clients opens the workspace
- **THEN** the button reads "הלקוחות שלי", looks pressed, and the list shows those 3 clients

#### Scenario: Nobody assigned to the signed-in person
- **WHEN** a staff viewer who is the advisor of no client opens a workspace where other people are advisors
- **THEN** the button reads "כל היועצים", the list shows every client, and the picker still lists "אני" second

#### Scenario: Accountant with own clients
- **WHEN** the accountant, who is the advisor of 2 clients, opens the workspace
- **THEN** the button reads "כל היועצים" and the list shows every client; picking "אני" shows the 2 clients

#### Scenario: "אני" with no own clients
- **WHEN** a person who is the advisor of no client picks "אני"
- **THEN** the list shows the "no client matches" message and the button reads "הלקוחות שלי"

#### Scenario: No client has an advisor
- **WHEN** no client in the loaded list has a stored tax advisor
- **THEN** no picker button is shown and the list shows every client

#### Scenario: Admin viewing as the accountant
- **WHEN** an admin views the workspace as an accountant who is the advisor of 1 client and picks "אני"
- **THEN** the list shows that 1 client

#### Scenario: Letter case
- **WHEN** two clients store the advisor emails "Dana@Office.co.il" and "dana@office.co.il"
- **THEN** the picker lists that advisor once, and picking it shows both clients

#### Scenario: Signed-in person not repeated
- **WHEN** the signed-in person is the advisor of some clients
- **THEN** the picker lists them only as "אני" and not again by name among the other advisors

#### Scenario: Advisor without an email
- **WHEN** a client's stored advisor has the name "יוסי" and no email
- **THEN** the picker lists "יוסי" among the other advisors, and picking it shows the clients whose advisor is stored as "יוסי" without an email

#### Scenario: Client with no advisor
- **WHEN** a client has no stored tax advisor and any option other than "הכל" is chosen
- **THEN** that client is not listed

#### Scenario: Search within own clients
- **WHEN** "דנה שמש" is chosen and the viewer types a name that only a client of another advisor has
- **THEN** the list shows the "no client matches" message

#### Scenario: Closing without picking
- **WHEN** the picker is open and the viewer presses Escape or presses outside it
- **THEN** the picker closes and the choice and the list do not change

#### Scenario: Chosen advisor leaves the list
- **WHEN** "דנה שמש" is chosen and, after a roster refresh, no client in the loaded list has her as advisor
- **THEN** the choice returns to "הכל" and the list shows every client

#### Scenario: Text and icon
- **WHEN** the button is shown with "אני" chosen
- **THEN** it reads "הלקוחות שלי" with a person icon before the text and without the word "בלבד"

### Requirement: The list can be narrowed to one dot color
Between the search box and the client list, the sidebar SHALL show one bar of five buttons of which exactly one is pressed: "הכל" with the number of clients in the loaded list, then a blue, a green, an orange and a red button, each showing its dot and the number of clients whose dot has that color. "הכל" SHALL be pressed when the page opens. Pressing a color button SHALL show only the clients whose dot has that color; pressing "הכל" SHALL show every client. The pressed button SHALL be visibly distinct from the others. Each color button SHALL carry a hover text naming its meaning: in progress; all documents received; the due date passed with documents missing; the client refused. The counts SHALL count the loaded list (live clients, or deleted clients when that list is shown) after the tax advisor picker's narrowing when its choice is not "הכל", and SHALL NOT change with the search text. A button whose count is zero SHALL still be shown and pressable, and the list then shows the empty-result message. The choice SHALL NOT be kept across page reloads.

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
- **WHEN** an advisor is chosen in the tax advisor picker and 3 of those 8 clients are that advisor's, 2 in progress and 1 complete
- **THEN** the buttons read "הכל 3", blue 2, green 1, orange 0, red 0

#### Scenario: Empty color
- **WHEN** no client is refused and the accountant presses the red button
- **THEN** the list shows the "no client matches" message and the red button stays pressed
