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
In the client's conversation view, the message a split file arrived on SHALL show the original file and every child file as attachments, the original first and the children in page order. A child's attachment label SHALL be the original's label followed by the child's page range (for example "scan.pdf · pages 3-5"). Opening a child attachment SHALL open the child file, which holds only its own pages.

#### Scenario: Split file in the conversation
- **WHEN** a client's message carried "scan.pdf" and it was split into pages 1-3 and pages 4-5
- **THEN** the message shows three attachments: "scan.pdf", "scan.pdf · pages 1-3" and "scan.pdf · pages 4-5"

#### Scenario: File that was not split
- **WHEN** a client's message carried a one-page PDF
- **THEN** the message shows that one attachment, as before
