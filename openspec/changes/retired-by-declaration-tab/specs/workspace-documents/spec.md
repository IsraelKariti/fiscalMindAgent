## ADDED Requirements

### Requirement: Retired rows are split by what replaced them
The capital-declaration documents card SHALL show retired rows in two separate status tabs: "הוחלפו במסמכים אחרים" for rows the requirements ladder replaced by other documents, and "הוחלפו בהצהרת הלקוח" for rows replaced by the client's own declaration (a property cost declaration or a client vehicle declaration — the papers the catalog marks as statable in the chat). Each tab SHALL appear only when it has at least one row and SHALL show its count, like the other status tabs. The two tabs SHALL sit after "לא נדרשים", documents first, declaration second. The badge of a retired row SHALL name which of the two it is ("הוחלף במסמכים אחרים" / "הוחלף בהצהרת הלקוח"), and the row SHALL keep the same note (the client's quoted words or the proving file) and the same actions (return to required, remove) as today. The progress count SHALL be unchanged: retired rows of both kinds stay outside the goal.

#### Scenario: Contract replaced by a written cost declaration
- **WHEN** the planner retired "חוזה רכישה — בית בקיבוץ שדה נחום" in the same answer that added the item "הצהרת עלות — בית בקיבוץ שדה נחום"
- **THEN** the row appears under the "הוחלפו בהצהרת הלקוח" tab with the badge "הוחלף בהצהרת הלקוח", and the "הוחלפו במסמכים אחרים" tab is not shown when no other retired row exists

#### Scenario: Licence replaced by the client's vehicle declaration
- **WHEN** the planner retired "העתק רישיון רכב — מאזדה 3" in the same answer that stated facts on the vehicle's existing "הצהרת הלקוח על הרכב" item
- **THEN** the licence row appears under "הוחלפו בהצהרת הלקוח"

#### Scenario: Contract replaced by assessment and Tabu
- **WHEN** the planner retired a purchase contract in the same answer that added a purchase-tax assessment item and a Tabu extract item and no declaration item
- **THEN** the contract row appears under "הוחלפו במסמכים אחרים" with the badge "הוחלף במסמכים אחרים"

#### Scenario: Appendix retired by a proven private seller
- **WHEN** the planner retired a payments appendix citing an approved contract file (no declaration involved)
- **THEN** the appendix row appears under "הוחלפו במסמכים אחרים"

#### Scenario: Both kinds on one client
- **WHEN** a client has one row replaced by other documents and one row replaced by a declaration
- **THEN** both tabs are shown, each with count 1, and each row sits only in its own tab

#### Scenario: Row retired before this change
- **WHEN** a row was retired before the system recorded what replaced it
- **THEN** it appears under "הוחלפו במסמכים אחרים", as today

### Requirement: The system records what replaced a retired row
When the planner's answer retires a row, the system SHALL record on that row whether it was replaced by the client's declaration or by other documents. The planner SHALL NOT be asked to say which; the system SHALL derive it from the same answer: the row counts as replaced by the client's declaration when that answer gives the client a declaration-paper item of the retired row's document type — an instance added with a statable paper, or a cost or vehicle statement on an existing item with a statable paper — and as replaced by other documents otherwise. The retire step in the conversation trace and the audit event of the retirement SHALL name what replaced the row.

#### Scenario: Declaration added in the same answer
- **WHEN** an answer retires a vehicle licence item and adds a `vehicle_declaration` instance for the same vehicle
- **THEN** the licence row is recorded as replaced by the client's declaration, and the retire step's detail says so

#### Scenario: Declaration stated on an existing item
- **WHEN** an answer retires a vehicle receipt item and states a cost on the vehicle's existing `vehicle_declaration` item
- **THEN** the receipt row is recorded as replaced by the client's declaration

#### Scenario: Only documents in the same answer
- **WHEN** an answer retires a property contract item and adds assessment and Tabu items
- **THEN** the contract row is recorded as replaced by other documents

#### Scenario: Declaration of another type in the same answer
- **WHEN** an answer retires a property contract item and, for an unrelated vehicle, states facts on a vehicle declaration
- **THEN** the contract row is recorded as replaced by other documents, because the declaration is not of the contract's type

#### Scenario: Accountant reopens the row
- **WHEN** the accountant returns a retired row to required and the planner later retires it again
- **THEN** the recorded replacement is the one derived from the later answer
