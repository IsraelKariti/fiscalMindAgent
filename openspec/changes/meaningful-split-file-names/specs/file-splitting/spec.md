## ADDED Requirements

### Requirement: A child file that matches a list document is named after that document
When the classifier matches a child file to a document on the client's list and `validate_classification` accepts the match, the child SHALL get a display name equal to the name of the matched document. The display name SHALL be taken from the client's document list only; text the model wrote about the file and text from the file itself SHALL NOT be used as a name. A child with no accepted match, a quarantined child (not legible or suspected injection) and a child whose analysis failed SHALL have no display name and SHALL be shown by its page-range file name as before. When the classifier runs again on the same child, the display name SHALL follow the new verdict, and SHALL be removed when the new verdict has no accepted match. When the planner links a child to a list document other than the one that gave it its display name, the display name SHALL change to the name of the linked document.

The display name SHALL be what the documents list and the file viewer show as the file's name, and the original file's name and the child's page range SHALL stay visible next to it. The stored file name of the child, the file name the planner sees, and the child's identity for idempotent creation SHALL NOT change. A file that was never split SHALL NOT get a display name from this rule.

#### Scenario: Two children match two list documents
- **WHEN** "scan.pdf" is split into pages 1-2 and pages 3-4, the first child is matched to the list document "אישור יתרות - בנק לאומי" and the second to "צילום תעודת זהות", and the gate accepts both matches
- **THEN** the documents list shows the first child as "אישור יתרות - בנק לאומי" and the second as "צילום תעודת זהות", each with a line that says it is pages 1-2 / 3-4 of "scan.pdf"

#### Scenario: A child matches nothing
- **WHEN** a child of "scan.pdf" covering pages 5-6 matches no document on the list
- **THEN** the child has no display name and is shown as "scan-p5-6.pdf" as before

#### Scenario: The gate drops the match
- **WHEN** the classifier proposes a document id that `validate_classification` rejects
- **THEN** the child gets no display name

#### Scenario: Quarantined child
- **WHEN** the classifier judges a child not legible while also proposing a match
- **THEN** the child is quarantined as today and gets no display name

#### Scenario: Planner links the child to another document
- **WHEN** a child named "אישור יתרות - בנק לאומי" by the classifier is linked by the planner to the list document "אישור יתרות - בנק דיסקונט"
- **THEN** the child's display name becomes "אישור יתרות - בנק דיסקונט"

#### Scenario: File that was not split
- **WHEN** a client sends a one-page PDF "balance.pdf" that the classifier matches to a list document
- **THEN** the file is still shown as "balance.pdf"

#### Scenario: Planner's view
- **WHEN** the planner cycle runs after a child got a display name
- **THEN** the planner still sees the child under its stored file name with its page range and parent file id

### Requirement: A named child file downloads under a meaningful file name
Downloading a child file that has a display name SHALL save it under a file name built from the display name, the base name of the original file and the page range, ending in `.pdf` (for example `אישור יתרות - בנק לאומי (scan p1-2).pdf`). Characters that are not allowed in file names SHALL be replaced. A child with no display name, and every file that is not a child, SHALL download under its stored file name as today.

#### Scenario: Named child
- **WHEN** the accountant downloads the child of "scan.pdf" covering pages 1-2 whose display name is "אישור יתרות - בנק לאומי"
- **THEN** the saved file is named "אישור יתרות - בנק לאומי (scan p1-2).pdf"

#### Scenario: Unnamed child
- **WHEN** the accountant downloads a child with no display name
- **THEN** the saved file is named "scan-p5-6.pdf" as today

#### Scenario: Display name with a slash
- **WHEN** the display name is "דוח שנתי 2024/2025"
- **THEN** the slash is replaced in the saved file name and the download succeeds

## MODIFIED Requirements

### Requirement: The conversation shows the original file and the files cut from it
In the client's conversation view, the message a split file arrived on SHALL show the original file and every child file as attachments, the original first and the children in page order. The attachment label of a child with no display name SHALL be the original's label followed by the child's page range (for example "scan.pdf · pages 3-5"). The attachment label of a child with a display name SHALL be the display name, then the original's label, then the page range (for example "אישור יתרות - בנק לאומי · scan.pdf · pages 1-2"). Opening a child attachment SHALL open the child file, which holds only its own pages.

#### Scenario: Split file in the conversation
- **WHEN** a client's message carried "scan.pdf" and it was split into pages 1-3 and pages 4-5, and neither child has a display name
- **THEN** the message shows three attachments: "scan.pdf", "scan.pdf · pages 1-3" and "scan.pdf · pages 4-5"

#### Scenario: Named child in the conversation
- **WHEN** the child covering pages 1-3 of "scan.pdf" has the display name "אישור יתרות - בנק לאומי"
- **THEN** its attachment reads "אישור יתרות - בנק לאומי · scan.pdf · pages 1-3", and the other child still reads "scan.pdf · pages 4-5"

#### Scenario: File that was not split
- **WHEN** a client's message carried a one-page PDF
- **THEN** the message shows that one attachment, as before
