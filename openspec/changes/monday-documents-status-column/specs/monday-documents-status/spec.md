## Purpose
How the agent mirrors the client dot's state (in progress, complete, refused, window ended) into a second status column of the client's monday board row, so the accountant sees the collection's state on the board without opening the workspace.

## ADDED Requirements

### Requirement: A board source can map a documents status column
When an accountant maps a monday board for a declaration-of-capital agent, the mapping SHALL offer one more optional pick, the documents status column, limited to the board's status-typed columns and separate from the existing status column (the two MAY be the same column only if the accountant picks it twice; nothing prevents it). When the board has a status column titled "מסמכים", that column SHALL be preselected. The chosen column SHALL be stored with the board's other column ids and SHALL appear in the board's mapping summary in the settings panel. A board mapped without it SHALL behave exactly as today.

#### Scenario: Board with a "מסמכים" status column
- **WHEN** the accountant adds a board that has a status column titled "מסמכים" and another status column
- **THEN** the mapping modal shows a documents status column pick with "מסמכים" preselected, next to the existing status column pick

#### Scenario: Board without the pick
- **WHEN** the accountant confirms the mapping with the documents status column left empty
- **THEN** the board is saved as today and no documents status label is ever written for its rows

#### Scenario: Mapping summary
- **WHEN** a board with a documents status column mapped is listed in the settings panel
- **THEN** the summary line names that column's title after the existing status column entry

### Requirement: The documents status label mirrors the client dot
For a client that carries a board row address and whose board maps a documents status column, the agent SHALL write one of four fixed labels to that column, chosen by the client's dot state with the same rule and precedence as the client dot (`client-status-indicator`): refused → `סירוב סוכן`; complete → `הושלם בהצלחה`; window ended → `הסתיים חלקית`; in progress → `בטיפול סוכן`. The write SHALL happen at every event that can change the dot's state: the conversation start (kickoff webhook or the first resume of a never-contacted client), goal completion, goal reopening, the client's decline, the overdue stop at the window's end, and a resume that hands a refused or window-ended client back to the agent (the pause toggle or a new due date). The label SHALL be computed from the client's stored state after the event, never from the event's name alone. The existing status column and its labels SHALL be written exactly as before; the new column is written in addition.

#### Scenario: Kickoff
- **WHEN** the accountant triggers the monday kickoff on a board row whose board maps both status columns
- **THEN** the existing status column receives `בטיפול סוכן` as today and the documents status column receives `בטיפול סוכן`

#### Scenario: All documents collected
- **WHEN** a client's goal becomes complete
- **THEN** the existing status column receives `מסמכים נאספו` as today and the documents status column receives `הושלם בהצלחה`

#### Scenario: Client refused
- **WHEN** a pending client declines the WhatsApp collection and the agent stops
- **THEN** the documents status column receives `סירוב סוכן` and the existing status column is not written

#### Scenario: Window ended
- **WHEN** the overdue scan stops a pending client because its due date passed
- **THEN** the documents status column receives `הסתיים חלקית` and the existing status column is not written

#### Scenario: Refused and overdue
- **WHEN** a declined client's due date passes
- **THEN** the overdue scan does not stop it again, and the column keeps `סירוב סוכן`

#### Scenario: Resumed after a refusal
- **WHEN** the accountant resumes a refused client with the pause toggle
- **THEN** the documents status column receives `בטיפול סוכן`

#### Scenario: New due date after the window ended
- **WHEN** the accountant sets a new due date on a window-ended client
- **THEN** the documents status column receives `בטיפול סוכן`

#### Scenario: Goal reopened
- **WHEN** a complete client's goal reopens because a document is no longer settled
- **THEN** the existing status column receives `בטיפול סוכן` as today and the documents status column receives `בטיפול סוכן`

#### Scenario: Pause by the accountant
- **WHEN** the accountant pauses an in-progress client
- **THEN** no label is written, because the dot stays blue

### Requirement: The documents status write never blocks the conversation
A documents status write SHALL be best-effort: when the client has no board row address, the board maps no documents status column, the accountant has no monday connection, or monday rejects the write, the event's own work SHALL complete unchanged and the failure SHALL only be logged. A test client SHALL never cause a board write.

#### Scenario: Board without the mapping
- **WHEN** a client whose board maps only the existing status column declines
- **THEN** the decline is handled as today and no monday write is attempted for the documents column

#### Scenario: monday rejects the write
- **WHEN** the documents status write fails because the row was deleted on the board
- **THEN** the client's state change stands, the failure is logged, and the client is not retried later

#### Scenario: Test client
- **WHEN** an admin test client completes its goal
- **THEN** no monday board is written
