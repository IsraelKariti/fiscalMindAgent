# file-splitting Specification

## Purpose
How the capital-declaration agent handles one inbound PDF that holds several documents: it finds the page range of each document, checks the ranges in code, cuts the file into one child file per document, and classifies every child on its own, while the original file is kept untouched.

## Requirements

### Requirement: The split step runs only for multi-page PDFs that passed the injection screen
The split step SHALL run after the file injection screen and before the classifier. It SHALL run only for a PDF file with two or more pages that the screen did not block and that is within the size limit of content analysis. An image, a one-page PDF, a file the screen blocked, and a file that is not analyzable SHALL NOT reach the split step, and no model call SHALL be made for them by this step. The page count SHALL be read by code, not by the model.

#### Scenario: Image file
- **WHEN** a client sends a JPEG photo
- **THEN** the split step is skipped with no model call, and the file goes to the classifier as today

#### Scenario: One-page PDF
- **WHEN** a client sends a PDF with one page
- **THEN** the split step is skipped with no model call, and the file goes to the classifier as today

#### Scenario: Multi-page PDF
- **WHEN** a client sends a PDF with five pages that passed the injection screen
- **THEN** the split step asks the model how many documents the file holds and which pages belong to each

#### Scenario: Blocked file
- **WHEN** the injection screen blocks a five-page PDF
- **THEN** the file is quarantined as today and the split step does not run

#### Scenario: PDF that cannot be opened
- **WHEN** code cannot read the page count of a PDF (for example it is encrypted or damaged)
- **THEN** the split step is skipped and the file goes to the classifier whole, as today

### Requirement: The model proposes page ranges and code decides
The split step's model answer SHALL be a list of documents, each with a first page and a last page (1-based, inclusive). Nothing SHALL be cut before a code gate, `validate_file_split`, accepts the answer. The gate SHALL accept the answer only when all of these hold: every range lies inside the file's page count and its first page is not after its last page; the ranges are in ascending order and do not overlap; every page of the file belongs to exactly one range; the number of documents is not above the cap of 20. The gate SHALL write one audit row per run as the `code-gates` capability requires. Usage of the model call SHALL be recorded under its own purpose, `file_splitting`, like the other stages.

#### Scenario: Valid split
- **WHEN** the model answers pages 1-3 and pages 4-5 for a five-page PDF
- **THEN** the gate accepts the answer and the file is cut into two child files

#### Scenario: Single document
- **WHEN** the model answers one document covering pages 1-5 of a five-page PDF
- **THEN** the gate accepts the answer, nothing is cut, and the whole file goes to the classifier as today

#### Scenario: Range outside the file
- **WHEN** the model answers pages 1-3 and pages 4-7 for a five-page PDF
- **THEN** the gate rejects the answer, nothing is cut, and the whole file goes to the classifier as today

#### Scenario: Overlapping ranges
- **WHEN** the model answers pages 1-3 and pages 3-5
- **THEN** the gate rejects the answer and nothing is cut

#### Scenario: Page left out
- **WHEN** the model answers pages 1-2 and pages 4-5 for a five-page PDF
- **THEN** the gate rejects the answer because page 3 belongs to no range, and nothing is cut

#### Scenario: Too many documents
- **WHEN** the model answers 25 documents for a 25-page PDF
- **THEN** the gate rejects the answer and nothing is cut

### Requirement: A rejected or failed split falls back to today's behavior
When the gate rejects the answer, the model call fails, the answer does not match the schema, or cutting the file fails, the system SHALL cut nothing, SHALL keep no child files from that attempt visible as documents, and SHALL send the whole file to the classifier exactly as it does today. A failure of the split step SHALL NOT mark the file as failed and SHALL NOT quarantine it.

#### Scenario: Model call fails
- **WHEN** the split step's model call throws an error
- **THEN** the whole file is classified as today and its analysis status ends as the classifier sets it

#### Scenario: Gate rejects
- **WHEN** the gate rejects the proposed ranges
- **THEN** the audit row records `result: false` with the failed check, and the whole file is classified as today

### Requirement: An accepted split produces one child file per document
When the gate accepts two or more documents, the system SHALL create one child PDF per range that contains exactly the pages of that range, in order. Each child SHALL be stored as a received file of the same client and the same inbound message as the parent, SHALL record which file is its parent and its first and last page, and SHALL have a file name that shows the page range. Creating children SHALL be idempotent: processing the same parent again SHALL NOT create duplicate children.

#### Scenario: Children created
- **WHEN** a five-page parent "scan.pdf" is split into pages 1-3 and 4-5
- **THEN** two child files exist, one with the three pages 1-3 and one with the two pages 4-5, each pointing to "scan.pdf" as its parent and recording its page range

#### Scenario: Same parent processed twice
- **WHEN** the split of the same parent runs a second time with the same accepted ranges
- **THEN** no additional child files are created

### Requirement: Every child is classified on its own and then treated like any received file
Each child SHALL go through the existing classifier unchanged: one file, one verdict, one matched checklist item at most, checked by `validate_classification`. Children SHALL NOT go through the file injection screen again, because the whole parent already passed it. After classification a child SHALL be subject to the same evidence, linking and verification rules as any received file. The classifier's own quarantine rules (suspected injection, not legible) SHALL still apply to each child.

#### Scenario: Two children match two checklist items
- **WHEN** a parent holds a bank balance confirmation and an ID copy, and both are on the client's checklist
- **THEN** the first child matches the bank item, the second child matches the ID item, and both items can be collected and verified from their own child file

#### Scenario: A child matches nothing
- **WHEN** one child is a document that is not on the checklist
- **THEN** that child ends as an analyzed file with no match, and the other children are not affected

#### Scenario: A child is not legible
- **WHEN** the classifier judges one child not legible
- **THEN** that child is quarantined as today, and the other children are not affected

### Requirement: The original file is kept and is never used as a document
The parent of an accepted split SHALL be kept unchanged in storage and SHALL get the analysis status "split". It SHALL NOT be classified, SHALL NOT count as evidence for collecting a document, SHALL NOT be linked to a checklist item (also when the planner proposes such a link), and SHALL NOT be sent to verification. The planner SHALL see the parent marked as split into separate files, with the instruction not to use it and to judge the child files instead.

#### Scenario: Planner proposes linking the parent
- **WHEN** the planner's answer pairs the parent file with a checklist item
- **THEN** the pair is ignored: the parent stays unlinked and the item is not collected because of it

#### Scenario: Parent in the planner's view
- **WHEN** the planner cycle runs after a file was split into three children
- **THEN** the planner sees the parent with a note that it was split into three files listed separately, and sees each child with its own content-analysis line

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

### Requirement: A child file that matches a list document is named after that document
When the classifier matches a child file to a document on the client's list and `validate_classification` accepts the match, the child SHALL get a display name equal to the name of the matched document — except when the matched document is of an institution-bound type and names no company the institutions table knows, and the company printed on the child is recognised as exactly one company of that table: then the display name SHALL be the matched document's name, followed by " — " and the company's Hebrew name from the institutions table. When the matched document names no company and the child's company is not recognised, the display name SHALL be the matched document's name alone.

When a child file has no accepted match, is not quarantined, and the classifier put it in one of the known document types (not the catch-all "other" type), the child SHALL get a display name built from the platform's own fixed words only: the platform's short name of that document type, followed by " — " and the company's name from the institutions table when the company printed on the file is recognised as exactly one company of that table. When the company is not recognised, or the text names two different companies, the display name SHALL be the short type name alone. The short type name SHALL NOT state a date or a year.

A display name SHALL be taken from the client's document list, the platform's list of document types and the institutions table only; text the model wrote about the file (its description, its summary, the company name as the model wrote it) and text from the file itself SHALL NOT be used as a name. A quarantined child (not legible or suspected injection), a child whose analysis failed, and an unmatched child of the catch-all "other" type SHALL have no display name and SHALL be shown by its page-range file name as before. When the classifier runs again on the same child, the display name SHALL follow the new verdict. When the planner links a child to a list document, the display name SHALL become the name of the linked document, also when the child carried a type-based name before; when that linking splits or renames the document by company (openspec `unlisted-files`), the display name SHALL be the name of the document the child ends under, which then names the company.

The display name SHALL be what the documents list and the file viewer show as the file's name, and the original file's name and the child's page range SHALL stay visible next to it, so two children with the same display name can still be told apart. The stored file name of the child, the file name the planner sees, and the child's identity for idempotent creation SHALL NOT change. A file that was never split SHALL NOT get a display name from this rule. A display name SHALL NOT count as a match: it SHALL NOT link the child to a list document, SHALL NOT collect a document and SHALL NOT change what the planner is told about the file.

#### Scenario: Two children match two list documents
- **WHEN** "scan.pdf" is split into pages 1-2 and pages 3-4, the first child is matched to the list document "אישור יתרות - בנק לאומי" and the second to "צילום תעודת זהות", and the gate accepts both matches
- **THEN** the documents list shows the first child as "אישור יתרות - בנק לאומי" and the second as "צילום תעודת זהות", each with a line that says it is pages 1-2 / 3-4 of "scan.pdf"

#### Scenario: Unmatched child with a recognised company
- **WHEN** a child of "scan.pdf" covering pages 20-21 matches no document on the list, the classifier typed it as a study fund, and the company printed on it is recognised as Harel
- **THEN** the child's display name is "קרן השתלמות — הראל", and the line next to it still says it is pages 20-21 of "scan.pdf"

#### Scenario: Unmatched child with no recognised company
- **WHEN** a child matches no document on the list, the classifier typed it as a study fund, and the company printed on it is not in the institutions table
- **THEN** the child's display name is "קרן השתלמות"

#### Scenario: A child matches nothing
- **WHEN** a child of "scan.pdf" covering pages 5-6 matches no document on the list and the classifier typed it as "other"
- **THEN** the child has no display name and is shown as "scan-p5-6.pdf" as before

#### Scenario: The gate drops the match
- **WHEN** the classifier proposes a match for a child it typed as life insurance savings from a recognised company, and `validate_classification` drops the match because the list item names a different company
- **THEN** the child is not linked to the list item, and its display name is the type-based name (the short name of life insurance savings and the company's name), not the list item's name

#### Scenario: The list item names no company
- **WHEN** the classifier matches a child it typed as life insurance savings from Harel to the list item "אישור להצהרת הון — ביטוח מנהלים / פוליסת חיסכון ליום 31.12.2025 — ניב", which names no company, and `validate_classification` keeps the match
- **THEN** the child is linked to the list item and its display name is "אישור להצהרת הון — ביטוח מנהלים / פוליסת חיסכון ליום 31.12.2025 — ניב — הראל"

#### Scenario: Three children of three companies match one item that names no company
- **WHEN** three children of one PDF, from Harel, Clal and Migdal, all match the list item "ביטוח מנהלים ניב", which names no company
- **THEN** the children are shown as "ביטוח מנהלים ניב — הראל", "ביטוח מנהלים ניב — כלל" and "ביטוח מנהלים ניב — מגדל"

#### Scenario: The list item names no company and the child's company is not recognised
- **WHEN** the classifier matches a child to the list item "ביטוח מנהלים ניב" and `validate_classification` keeps the match on the client's evidence although the company printed on the child is not in the institutions table
- **THEN** the child's display name is "ביטוח מנהלים ניב"

#### Scenario: Two children of the same type and company
- **WHEN** two unmatched children of "scan.pdf", pages 34-35 and pages 36-37, are both study fund reports of the same recognised company
- **THEN** both get the same display name, and each is told apart by its page range shown next to the name

#### Scenario: Model text is not used
- **WHEN** the classifier describes an unmatched child as "דוח שנתי ואישור מס להצהרת הון - קרן השתלמות" and writes the company as "הראל פנסיה וגמל בע"מ"
- **THEN** the display name is "קרן השתלמות — הראל", built from the platform's type name and the institutions table, and contains neither of the model's two texts

#### Scenario: Quarantined child
- **WHEN** the classifier judges a child not legible while also proposing a match or a type
- **THEN** the child is quarantined as today and gets no display name

#### Scenario: Planner links the child to another document
- **WHEN** a child named "אישור יתרות - בנק לאומי" by the classifier is linked by the planner to the list document "אישור יתרות - בנק דיסקונט"
- **THEN** the child's display name becomes "אישור יתרות - בנק דיסקונט"

#### Scenario: Planner links a child that had a type-based name
- **WHEN** a child named "קרן השתלמות — הראל" is later linked by the planner to the list document "אישור יתרת קרן השתלמות ליום 31.12.2025 — הראל"
- **THEN** the child's display name becomes the name of that list document

#### Scenario: Planner ties the child to an item that is then split by company
- **WHEN** a Clal child named "ביטוח מנהלים ניב — כלל" by the classifier is tied by the planner to the item "ביטוח מנהלים ניב", and the tie creates the item "ביטוח מנהלים ניב — כלל" for it
- **THEN** the child's display name is "ביטוח מנהלים ניב — כלל", the name of the item it ends under

#### Scenario: File that was not split
- **WHEN** a client sends a one-page PDF "balance.pdf" that the classifier matches to a list document, or matches to nothing
- **THEN** the file is still shown as "balance.pdf"

#### Scenario: Planner's view
- **WHEN** the planner cycle runs after a child got a display name of either kind
- **THEN** the planner still sees the child under its stored file name with its page range and parent file id, and with the same content-analysis line as before

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
