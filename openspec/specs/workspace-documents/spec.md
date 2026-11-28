# workspace-documents Specification

## Purpose
What the workspace documents tab shows an accountant about one client: the required-documents checklist, the files received for each item, and the files that matched no item.

## Requirements

### Requirement: One card lists documents and their files
The documents tab SHALL show a single required-documents card. It SHALL NOT show a separate card that lists all received files.

#### Scenario: Documents tab layout
- **WHEN** an accountant opens a client's documents tab
- **THEN** the tab shows the required-documents card and no separate "files received" card

### Requirement: Linked files appear under their checklist item
Every received file that is linked to a checklist item SHALL appear as its own sub-row under that item. Each sub-row SHALL show the file's display name (label when present, otherwise filename), its size and received date, its content-analysis line, and view and download controls.

#### Scenario: Single linked file
- **WHEN** a checklist item has exactly one linked file
- **THEN** the item shows one sub-row with that file's name, size, date, analysis line, and view/download controls

#### Scenario: Several linked files
- **WHEN** a checklist item has more than one linked file (for example two uploads of the same document, or several employers' 106 forms)
- **THEN** the item shows one sub-row per file, oldest first, and every file has its own view/download controls

### Requirement: Content-analysis line per file
Each file sub-row SHALL show the result of the content analysis. When analysis is done, the line SHALL state the identified document kind and, when known, the tax year and subject name. When analysis is not done, the line SHALL show a status badge: pending, failed, or unsupported. A file the platform fetched itself (analysis status "not needed") SHALL show a neutral "fetched automatically from the site" badge with a tooltip explaining that content analysis does not apply, and SHALL NOT be shown as pending. A file that was split into several documents (analysis status "split") SHALL show a neutral "split into N documents" badge, where N is the number of its child files, with a tooltip explaining that each document inside it is listed as its own file; it SHALL NOT show a verdict line and SHALL NOT be shown as pending. A file blocked by the injection filter SHALL show a "blocked" badge instead of a verdict. A done analysis that suspects prompt injection SHALL add a "suspicious content" badge, and one that found the file not legible SHALL add a "not legible" badge.

#### Scenario: Analysis done
- **WHEN** a file's analysis finished and identified a bank balance for tax year 2025 for "Israel Kariti"
- **THEN** its sub-row shows a line naming the document kind, the tax year, and the subject name

#### Scenario: Analysis pending
- **WHEN** a file was received but its analysis has not finished
- **THEN** its sub-row shows a "not yet analyzed" badge and no verdict line

#### Scenario: Fetched file
- **WHEN** a file was fetched by the platform from an external site (status "not needed")
- **THEN** its sub-row shows a "fetched automatically from the site" badge with a tooltip, and not the "not yet analyzed" badge

#### Scenario: Split file
- **WHEN** a file was split into three child files (status "split")
- **THEN** its entry shows a "split into 3 documents" badge with a tooltip, no verdict line, and not the "not yet analyzed" badge

#### Scenario: Blocked file
- **WHEN** the injection filter blocked a file
- **THEN** its sub-row shows a "blocked" badge with an explanatory tooltip and no verdict line

#### Scenario: Suspicious content
- **WHEN** a file's analysis finished and flagged suspected prompt injection
- **THEN** its sub-row shows the verdict line together with a "suspicious content" badge

### Requirement: Unmatched files group
Files linked to no checklist item SHALL appear in a "files not matched to a required document" group at the bottom of the required-documents card. Each entry SHALL show the same file detail and controls as a linked-file sub-row. The group SHALL be shown only when at least one such file exists, and its title SHALL include the count.

#### Scenario: A file matched nothing
- **WHEN** a client sent a file whose analysis matched no required document
- **THEN** the card shows the unmatched group with that file, its analysis line, and view/download controls

#### Scenario: All files matched
- **WHEN** every received file is linked to a checklist item
- **THEN** the unmatched group is not shown

#### Scenario: File later linked
- **WHEN** an unmatched file becomes linked to a checklist item and the tab is refreshed
- **THEN** the file moves from the unmatched group to a sub-row under that item

### Requirement: Progress count unchanged
The card's header progress badge SHALL keep counting checklist items (approved out of in-goal items), not files. Unmatched files SHALL NOT change the count.

#### Scenario: Unmatched file does not affect progress
- **WHEN** a client has five of six items approved and one unmatched file
- **THEN** the header badge still reads five of six

### Requirement: Every checklist row shows its status
Each row of the capital-declaration documents list SHALL show a status badge that names the row's current status, for every status: unresolved, pending, claimed, collected, approved, stated, not required and retired. The badge SHALL be the only element on the row that uses status wording. A stated row SHALL sit among the settled rows and SHALL show, under the badge, a clickable note quoting the client's words (the `chat-stated-cost` capability).

#### Scenario: Pending row
- **WHEN** a checklist item is pending
- **THEN** its row shows a badge saying the document is awaited from the client

#### Scenario: Unresolved row
- **WHEN** a checklist item is unresolved
- **THEN** its row shows a badge saying the item is still being clarified with the client

#### Scenario: Not-required row
- **WHEN** a checklist item is not required
- **THEN** its row shows a "not required" badge, and no button on the row carries that wording

#### Scenario: Collected row with stalled verification
- **WHEN** a checklist item is collected and its verification stalled or is unavailable
- **THEN** its badge says verification failed, styled as a danger badge

#### Scenario: Stated row
- **WHEN** a vehicle cost declaration was stated in the chat
- **THEN** its row shows a badge saying stated in chat, sits among the settled rows, and a note under it quotes the client's message

### Requirement: Row actions live in one actions menu
Each row of the capital-declaration documents list SHALL offer its actions through a single actions-menu button at the end of the row. The row SHALL NOT show inline action buttons or a standalone remove button. Every action label in the menu SHALL be a verb phrase that describes what the action does, never a bare status name.

#### Scenario: Row at rest
- **WHEN** an accountant views a checklist row without opening its menu
- **THEN** the row shows the document name, description, status badge and one actions-menu button, and no other action control

#### Scenario: Opening the menu
- **WHEN** the accountant activates the actions-menu button
- **THEN** a menu opens next to the button listing the actions available for that row's status, with the remove action last and visually marked as destructive

#### Scenario: Choosing an action
- **WHEN** the accountant chooses an action from the menu
- **THEN** the menu closes, the action runs, and the list refreshes with the row in its new group

#### Scenario: Action in progress
- **WHEN** an action on the card is still running
- **THEN** the actions-menu buttons are disabled until it finishes

### Requirement: Actions offered per status
The actions menu SHALL offer exactly these actions per row status, each with the same effect it has today: unresolved — mark as required, mark as not required, remove; pending — mark as not required, remove; claimed — confirm receipt, remove; collected — approve manually, remove; approved, stated, not required or retired — return to required, remove.

#### Scenario: Pending row menu
- **WHEN** the accountant opens the menu of a pending row
- **THEN** it lists "mark as not required" and "remove", and nothing else

#### Scenario: Unresolved row menu
- **WHEN** the accountant opens the menu of an unresolved row
- **THEN** it lists "mark as required", "mark as not required" and "remove"

#### Scenario: Not-required row menu
- **WHEN** the accountant opens the menu of a not-required row and chooses "return to required"
- **THEN** the row moves to the pending group

#### Scenario: Stated row menu
- **WHEN** the accountant opens the menu of a stated row
- **THEN** it lists "return to required" and "remove", and choosing "return to required" moves the row to the pending group

#### Scenario: Remove
- **WHEN** the accountant chooses "remove" from any row's menu
- **THEN** the checklist item is deleted, as the "×" button did before

### Requirement: The actions menu is an in-app, keyboard-operable popover
The actions menu SHALL be drawn by the app in the app's theme and SHALL NOT use a browser dialog or native popup. It SHALL close on Escape, on a click outside it, and when focus leaves it. It SHALL be operable by keyboard alone, and it SHALL stay fully inside the viewport in the right-to-left layout, including for rows at the bottom of the screen and inside the monday custom object.

#### Scenario: Escape closes
- **WHEN** the menu is open and the accountant presses Escape
- **THEN** the menu closes, no action runs, and focus returns to the actions-menu button

#### Scenario: Click outside closes
- **WHEN** the menu is open and the accountant clicks anywhere outside it
- **THEN** the menu closes and no action runs

#### Scenario: Keyboard use
- **WHEN** the accountant focuses the actions-menu button and presses Enter, moves with the arrow keys and presses Enter on an item
- **THEN** the menu opens, focus moves between items, and the chosen action runs

#### Scenario: Row near the bottom edge
- **WHEN** the accountant opens the menu of a row that has no room below it
- **THEN** the menu opens upward and is fully visible

#### Scenario: Only one menu open
- **WHEN** one row's menu is open and the accountant opens another row's menu
- **THEN** the first menu closes

### Requirement: The original of a split file stays visible
The parent of a split file SHALL appear in the "files not matched to a required document" group with the same view and download controls as any file, so the accountant can open the original file as the client sent it. It SHALL be counted in that group's title. It SHALL never appear as a sub-row under a checklist item.

#### Scenario: Parent in the unmatched group
- **WHEN** a client sent "scan.pdf" and it was split into two child files that both matched checklist items
- **THEN** the two children appear under their checklist items, and "scan.pdf" appears in the unmatched group with its "split into 2 documents" badge and view/download controls

#### Scenario: Progress not affected
- **WHEN** a client has five of six items approved and the only unmatched file is the parent of a split
- **THEN** the header badge still reads five of six

### Requirement: A child file shows where it came from
Each child file of a split SHALL show, wherever the file is listed (under a checklist item or in the unmatched group), a small note with its page range and the display name of its parent file, for example "pages 3-5 of scan.pdf". The rest of the entry (name, size, date, content-analysis line, view and download controls) SHALL be the same as for any file. View and download on a child SHALL open the child file, which holds only its own pages.

#### Scenario: Child under a checklist item
- **WHEN** a child file holding pages 3-5 of "scan.pdf" is linked to the bank balance item
- **THEN** its sub-row under that item shows the note "pages 3-5 of scan.pdf" next to its usual details

#### Scenario: Child that matched nothing
- **WHEN** a child file holding page 6 of "scan.pdf" matched no checklist item
- **THEN** it appears in the unmatched group with its content-analysis line and the note "page 6 of scan.pdf"

#### Scenario: Viewing a child
- **WHEN** the accountant clicks view on a child holding pages 3-5
- **THEN** a three-page PDF opens, not the whole original file

### Requirement: Not-required rows are split by their source
The capital-declaration documents card SHALL show "not required" rows in three separate status tabs, by the source of the decision: "לא נדרשים — לפי השאלון" for rows the intake questionnaire settled (the client answered the question or left it empty), "לא נדרשים — לפי השיחה" for rows the client's words in the conversation settled, and "לא נדרשים — סומנו ידנית" for rows the accountant marked by hand (no client words on the row). Each tab SHALL appear only when it has at least one row and SHALL show its count, like the other status tabs. The three tabs SHALL sit after "הוצהרו בצ'אט" and before the retired tabs, in the order questionnaire, conversation, by hand. The badge of the row ("לא נדרש"), its note (the client's quote, the empty-question note, or none) and its actions (return to required, remove) SHALL be unchanged. The progress count SHALL be unchanged: "not required" rows of every source stay outside the goal.

#### Scenario: Settled by a written answer on the questionnaire
- **WHEN** the intake questionnaire check settled "אישור יתרה — קרן השתלמות" as not required from the client's answer "אין לי קרן השתלמות"
- **THEN** the row appears under "לא נדרשים — לפי השאלון" with the badge "לא נדרש" and the quoted answer as its note

#### Scenario: Settled by an empty question on the questionnaire
- **WHEN** the intake questionnaire check settled a row as not required because the client left its question empty
- **THEN** the row appears under "לא נדרשים — לפי השאלון" with the empty-question note

#### Scenario: Settled in the conversation
- **WHEN** the planner settled a row as not required from the client's WhatsApp message "אין לי רכב"
- **THEN** the row appears under "לא נדרשים — לפי השיחה" and its note is the clickable quote that jumps to that message

#### Scenario: Marked by hand
- **WHEN** the accountant chose "mark as not required" on a pending row
- **THEN** the row appears under "לא נדרשים — סומנו ידנית" with no note

#### Scenario: All three on one client
- **WHEN** a client has 9 rows settled by the questionnaire, 1 by the conversation and 1 by hand
- **THEN** the card shows the three tabs with counts 9, 1 and 1, each row sits only in its own tab, and no single "לא נדרשים" tab is shown

#### Scenario: One source only
- **WHEN** every "not required" row of a client came from the questionnaire
- **THEN** only "לא נדרשים — לפי השאלון" is shown, with the count of those rows

### Requirement: A manual not-required mark carries no client quote
When the accountant marks a row "not required" by hand, the system SHALL drop any client quote stored on the row, so the row shows no note and is counted as marked by hand. The dropped quote SHALL remain in the audit trail of the earlier event that stored it.

#### Scenario: Row created by the planner, then marked by hand
- **WHEN** the planner created a pending row from the client's message "יש לי פנסיה במנורה" and the accountant then marks that row not required
- **THEN** the row shows no quote and appears under "לא נדרשים — סומנו ידנית"

#### Scenario: Row seeded by the catalog, then marked by hand
- **WHEN** the accountant marks a catalog-seeded unresolved row not required
- **THEN** the row appears under "לא נדרשים — סומנו ידנית" with no note

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

### Requirement: The documents card is titled "מסמכים"
The title of the documents card SHALL be "מסמכים". The card SHALL NOT show the title "מסמכים נדרשים".

#### Scenario: Card title
- **WHEN** an accountant opens a client's documents tab
- **THEN** the card header shows the title "מסמכים"

### Requirement: Download all files as one zip
The header of the documents card SHALL show a "הורד הכל" button when the client has at least one file to download. Activating the button SHALL download one zip file that holds the client's received files. The button SHALL be available to every user who can see the documents tab, including a read-only viewer, because the single-file download is available to the same users. The button SHALL NOT open a browser dialog of the app's own making; the browser's normal file download is the only feedback needed. The zip file SHALL be named "<client name> - מסמכים.zip".

#### Scenario: Client with files
- **WHEN** a client has four received files and the accountant clicks "הורד הכל"
- **THEN** the browser downloads one zip file named after the client, and the zip holds the four files

#### Scenario: Client with no files
- **WHEN** a client has no received file
- **THEN** the card header shows no "הורד הכל" button

#### Scenario: Read-only viewer
- **WHEN** a user who sees the documents tab in read-only mode opens a client with files
- **THEN** the "הורד הכל" button is shown and works

#### Scenario: Client of another agent instance
- **WHEN** a user requests the zip of a client they are not allowed to read
- **THEN** the request is refused the same way a single-file download is refused, and no zip is sent

### Requirement: Content of the zip
The zip SHALL hold every file the documents tab lists for the client, each file once, in its original bytes. The original of a split file SHALL be left out, because each of its documents is already in the zip as a child file. A file linked to a checklist item SHALL sit at the top level of the zip. A file linked to no checklist item SHALL sit in a folder named "קבצים שלא שויכו". Each file SHALL have the same name its own download button gives it. When two files in the same folder have the same name, the later one SHALL get a numbered suffix before its extension so no file overwrites another. Hebrew file and folder names SHALL be readable after the zip is opened on Windows and on macOS.

#### Scenario: Linked and unmatched files
- **WHEN** a client has two files linked to checklist items and one file that matched no item
- **THEN** the zip holds the two linked files at the top level and the third file inside the folder "קבצים שלא שויכו"

#### Scenario: Split file
- **WHEN** a client sent "scan.pdf" and it was split into two child files
- **THEN** the zip holds the two child files, each under the name its download button gives it, and does not hold "scan.pdf"

#### Scenario: Two files with the same name
- **WHEN** two linked files both download under the name "bank.pdf"
- **THEN** the zip holds "bank.pdf" and "bank (2).pdf"

#### Scenario: Spreadsheet file
- **WHEN** one of the client's files is an xlsx workbook
- **THEN** the zip holds the original workbook, not its text rendering

#### Scenario: Only the original of a split is unmatched
- **WHEN** every file of the client is linked to an item except the original of a split file
- **THEN** the zip has no "קבצים שלא שויכו" folder

### Requirement: A file that cannot be read does not fail the zip
When the stored bytes of a file cannot be read while the zip is built, the system SHALL leave that file out, SHALL still deliver the other files, and SHALL add a text file named "קבצים חסרים.txt" at the top level of the zip that lists the name of every file left out.

#### Scenario: One file is missing from storage
- **WHEN** a client has three files and the stored bytes of one of them cannot be read
- **THEN** the zip holds the other two files and "קבצים חסרים.txt" naming the third

#### Scenario: All files readable
- **WHEN** every file of the client is read successfully
- **THEN** the zip holds no "קבצים חסרים.txt"
