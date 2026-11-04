## MODIFIED Requirements

### Requirement: The list can be narrowed to one dot color
Between the search box and the client list, the sidebar SHALL show one bar of five buttons of which exactly one is pressed: "הכל" with the number of clients in the loaded list, then a blue, a green, an orange and a red button, each showing its dot and the number of clients whose dot has that color. "הכל" SHALL be pressed when the page opens. Pressing a color button SHALL show only the clients whose dot has that color; pressing "הכל" SHALL show every client. The pressed button SHALL be visibly distinct from the others. Each color button SHALL carry a hover text naming its meaning: in progress; all documents received; the due date passed with documents missing; the client refused. The counts SHALL count the loaded list (live clients, or deleted clients when that list is shown) and SHALL NOT change with the search text. A button whose count is zero SHALL still be shown and pressable, and the list then shows the empty-result message. The choice SHALL NOT be kept across page reloads.

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

#### Scenario: Empty color
- **WHEN** no client is refused and the accountant presses the red button
- **THEN** the list shows the "no client matches" message and the red button stays pressed

### Requirement: Search and status narrow together
When a color button is pressed and the search box holds text, the list SHALL show only the clients that match both the color and the search text. Clearing the search text SHALL leave the color choice in place, and pressing "הכל" SHALL leave the search text in place.

#### Scenario: Both at once
- **WHEN** the blue button is pressed and the accountant types "כהן"
- **THEN** the list shows only in-progress clients whose name, contact or file number contains "כהן"

#### Scenario: Clear the search
- **WHEN** the blue button is pressed and the accountant clears the search text
- **THEN** the list shows every in-progress client
