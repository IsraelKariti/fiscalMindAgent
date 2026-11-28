## ADDED Requirements

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
