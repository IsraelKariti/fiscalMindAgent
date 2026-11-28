## ADDED Requirements

### Requirement: The collected tab is the first tab
The capital-declaration documents card SHALL show the "נאספו" tab (approved rows) as the first status tab — the rightmost one in the right-to-left layout — whenever it has at least one row. The other tabs SHALL follow in this order: "בבירור מול הלקוח", "נדרשים", "סופקו ישירות למשרד", "התקבלו — באימות", "הוצהרו בצ'אט", "לא נדרשים — סומנו ידנית", "קבצים ללא שיוך". When the accountant has not chosen a tab, the first shown tab SHALL be the one in view.

#### Scenario: Collected and required rows
- **WHEN** a client has 17 approved rows and 3 pending rows
- **THEN** the first tab is "נאספו" with count 17, the next is "נדרשים" with count 3, and the card opens on "נאספו"

#### Scenario: No collected row yet
- **WHEN** a client has 3 pending rows and no approved row
- **THEN** no "נאספו" tab is shown and the card opens on "נדרשים"

#### Scenario: Accountant chose another tab
- **WHEN** the accountant clicks "נדרשים" and the list then refreshes
- **THEN** "נדרשים" stays in view and "נאספו" stays first in the row of tabs

### Requirement: The claimed tab is named "סופקו ישירות למשרד"
The status tab that lists claimed rows (documents the client says the office already has) SHALL be titled "סופקו ישירות למשרד". The card SHALL NOT show the title "סופקו כבר — ממתינים לאישורך". The row badge and the row actions (confirm receipt, remove) SHALL be unchanged.

#### Scenario: One claimed row
- **WHEN** a client has one claimed row
- **THEN** the card shows the tab "סופקו ישירות למשרד" with count 1, and the row's menu still offers "confirm receipt" and "remove"

## MODIFIED Requirements

### Requirement: Unmatched files group
Files linked to no checklist item SHALL appear in a group titled "קבצים ללא שיוך", the last tab of the required-documents card. The card SHALL NOT show the title "קבצים ללא התאמה למסמך נדרש". Each entry SHALL show the same file detail and controls as a linked-file sub-row. The group SHALL be shown only when at least one such file exists, and its title SHALL include the count.

#### Scenario: A file matched nothing
- **WHEN** a client sent a file whose analysis matched no required document
- **THEN** the card shows the "קבצים ללא שיוך" group with that file, its analysis line, and view/download controls

#### Scenario: All files matched
- **WHEN** every received file is linked to a checklist item
- **THEN** the unmatched group is not shown

#### Scenario: File later linked
- **WHEN** an unmatched file becomes linked to a checklist item and the tab is refreshed
- **THEN** the file moves from the unmatched group to a sub-row under that item

### Requirement: The original of a split file stays visible
The parent of a split file SHALL appear in the "קבצים ללא שיוך" group with the same view and download controls as any file, so the accountant can open the original file as the client sent it. It SHALL be counted in that group's title. It SHALL never appear as a sub-row under a checklist item.

#### Scenario: Parent in the unmatched group
- **WHEN** a client sent "scan.pdf" and it was split into two child files that both matched checklist items
- **THEN** the two children appear under their checklist items, and "scan.pdf" appears in the unmatched group with its "split into 2 documents" badge and view/download controls

#### Scenario: Progress not affected
- **WHEN** a client has five of six items approved and the only unmatched file is the parent of a split
- **THEN** the header badge still reads five of six

### Requirement: Not-required rows are split by their source
The capital-declaration documents card SHALL show only the "not required" rows the accountant marked by hand (no client words on the row), in the status tab "לא נדרשים — סומנו ידנית". "Not required" rows the intake questionnaire settled (the client answered the question or left it empty) and rows the client's words in the conversation settled SHALL NOT be shown on the card, in any tab; the tabs "לא נדרשים — לפי השאלון" and "לא נדרשים — לפי השיחה" SHALL NOT exist. The hand-marked tab SHALL appear only when it has at least one row and SHALL show its count, like the other status tabs. It SHALL sit after "הוצהרו בצ'אט" and before "קבצים ללא שיוך". The badge of a hand-marked row ("לא נדרש") and its actions (return to required, remove) SHALL be unchanged. The stored source of every "not required" decision SHALL be unchanged. The progress count SHALL be unchanged: "not required" rows of every source stay outside the goal.

#### Scenario: Settled by a written answer on the questionnaire
- **WHEN** the intake questionnaire check settled "אישור יתרה — קרן השתלמות" as not required from the client's answer "אין לי קרן השתלמות"
- **THEN** the row is not shown on the documents card and no "לא נדרשים — לפי השאלון" tab exists

#### Scenario: Settled by an empty question on the questionnaire
- **WHEN** the intake questionnaire check settled a row as not required because the client left its question empty
- **THEN** the row is not shown on the documents card

#### Scenario: One source only
- **WHEN** every "not required" row of a client came from the questionnaire
- **THEN** the card shows no "not required" tab at all

#### Scenario: Settled in the conversation
- **WHEN** the planner settled a row as not required from the client's WhatsApp message "אין לי רכב"
- **THEN** the row is not shown on the documents card and no "לא נדרשים — לפי השיחה" tab exists

#### Scenario: Marked by hand
- **WHEN** the accountant chose "mark as not required" on a pending row
- **THEN** the row appears under "לא נדרשים — סומנו ידנית" with no note

#### Scenario: All three on one client
- **WHEN** a client has 10 rows settled by the questionnaire, 1 by the conversation and 1 by hand
- **THEN** the card shows one "not required" tab, "לא נדרשים — סומנו ידנית", with count 1

#### Scenario: Progress count
- **WHEN** a client has 18 of 22 in-goal rows done and 11 hidden "not required" rows
- **THEN** the header badge still reads 18 / 22

### Requirement: Retired rows are split by what replaced them
The capital-declaration documents card SHALL NOT show retired rows — rows replaced by other documents or by the client's own declaration — in any tab. The tabs "הוחלפו במסמכים אחרים" and "הוחלפו בהצהרת הלקוח" SHALL NOT exist. The system SHALL keep recording on the row what replaced it, and the conversation trace SHALL keep naming it. The progress count SHALL be unchanged: retired rows of both kinds stay outside the goal.

#### Scenario: Contract replaced by a written cost declaration
- **WHEN** the planner retired "חוזה רכישה — בית בקיבוץ שדה נחום" in the same answer that added the item "הצהרת עלות — בית בקיבוץ שדה נחום"
- **THEN** the contract row is not shown on the documents card, and the declaration item is shown in its own status tab

#### Scenario: Licence replaced by the client's vehicle declaration
- **WHEN** the planner retired "העתק רישיון רכב — מאזדה 3" in the same answer that stated facts on the vehicle's existing "הצהרת הלקוח על הרכב" item
- **THEN** the licence row is not shown on the documents card, and the declaration row appears under "הוצהרו בצ'אט"

#### Scenario: Contract replaced by assessment and Tabu
- **WHEN** the planner retired a purchase contract in the same answer that added a purchase-tax assessment item and a Tabu extract item and no declaration item
- **THEN** the contract row is not shown on the documents card, and the assessment and Tabu rows appear under "נדרשים"

#### Scenario: Appendix retired by a proven private seller
- **WHEN** the planner retired a payments appendix citing an approved contract file (no declaration involved)
- **THEN** the appendix row is not shown on the documents card

#### Scenario: Both kinds on one client
- **WHEN** a client has one row replaced by other documents and one row replaced by a declaration
- **THEN** neither row is shown and the card has no "הוחלפו" tab

#### Scenario: Row retired before this change
- **WHEN** a row was retired before the system recorded what replaced it
- **THEN** it is not shown on the documents card
