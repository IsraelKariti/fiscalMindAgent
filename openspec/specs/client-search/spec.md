# client-search Specification

## Purpose
What the search box above the accountant's client list matches, how the typed text is compared, and how the office file number is shown in the list.

## Requirements

### Requirement: The client search matches name, contact and file number
The search box above the client list SHALL show the clients whose name, email address, WhatsApp number or office file number contains the typed text. Name and email SHALL be compared case-insensitively, as today. The file number comparison SHALL ignore spaces and dashes on both sides, so "12-345" finds the file number "12345" and "12345" finds "12-345". An empty box SHALL show every client. A client with no stored file number SHALL only be found by name or contact.

#### Scenario: Search by file number
- **WHEN** the accountant types "4471" and one client's file number is "2024-4471"
- **THEN** that client is listed, and a client whose name or contact does not contain "4471" and whose file number is "9001" is not

#### Scenario: Dashes ignored
- **WHEN** the accountant types "2024-44" and a client's file number is "202444"
- **THEN** that client is listed

#### Scenario: Name still matches
- **WHEN** the accountant types "ישראל"
- **THEN** every client whose name contains "ישראל" is listed, as before

#### Scenario: No file number stored
- **WHEN** a client has no file number and the accountant types digits that appear in no name or contact
- **THEN** that client is not listed

### Requirement: The file number shows in the client row
A client row in the list SHALL show the client's office file number, labelled as a file number, next to the contact line, when the client has one. A client without a file number SHALL show the row as today. The search placeholder SHALL name the three things it searches: name, email and file number.

#### Scenario: Row with a file number
- **WHEN** a client's file number is "2024-4471"
- **THEN** its row shows "תיק 2024-4471" beside the phone or email

#### Scenario: Row without a file number
- **WHEN** a client has no file number
- **THEN** its row shows only the name and the contact line

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
