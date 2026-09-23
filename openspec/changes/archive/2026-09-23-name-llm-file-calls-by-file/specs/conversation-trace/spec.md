## ADDED Requirements

### Requirement: Per-file LLM call rows name their file
Every LLM call that reads one received file (today: the file-splitting, file-classification and document-extraction stages) SHALL record which file it read, as the file's id, alongside the call. An LLM call that reads no single file (for example the message-drafting or questionnaire stages) SHALL record no file.

In the trace (the workspace conversation tab under impersonation, with the LLM-calls toggle on), the stage chip of a call that recorded a file SHALL show, after the stage name, the label of that file as the timeline labels the same file's attachment chip: the file's display name when it has one, otherwise its original name, and for a child cut out of a multi-document PDF the original's label followed by the page range (for example "Extract Document · scan.pdf · pages 3-5"). When the recorded file no longer exists in the client's files, the chip SHALL show the file's stored name if the server still has it, otherwise the plain stage name. Clicking the chip SHALL still open the same call detail modal as today.

The call detail modal of such a call SHALL show the same file label beside the stage name, and the admin conversation viewer's call line SHALL show it after the stage key. A call that recorded no file, and every call recorded before this requirement existed, SHALL keep the plain chip, modal header and viewer line, with no empty separator or placeholder.

The file name adds no new audience: it is served only through the admin-only conversation and call endpoints, and an accountant's session SHALL NOT receive it.

#### Scenario: Three files in one turn
- **WHEN** a client sends "leumi.pdf", "harel.pdf" and "clal.pdf" in one WhatsApp turn and the admin views the trace with the LLM-calls toggle on
- **THEN** the trace shows three `File Classification` chips reading "File Classification · leumi.pdf", "File Classification · harel.pdf" and "File Classification · clal.pdf", and each file's `Extract Document` chip names the same file

#### Scenario: Split child
- **WHEN** a five-page "scan.pdf" was cut into two children and the second child (pages 4-5) is classified
- **THEN** that call's chip reads "File Classification · scan.pdf · pages 4-5", the same text as the child's chip under the split step row

#### Scenario: Labelled child
- **WHEN** a split child later receives the display name "אישור יתרות - בנק לאומי" and the admin reopens the trace
- **THEN** the child's `Extract Document` chip reads the display name, then the original's name and page range, like the child's attachment chip

#### Scenario: Call without a file
- **WHEN** the admin views a `Generate Message` chip
- **THEN** the chip shows only the stage name, with no separator after it

#### Scenario: Old call
- **WHEN** the admin views a `File Classification` call recorded before this change
- **THEN** the chip shows only the stage name, and the call detail modal opens as before

#### Scenario: Modal and viewer agree with the chip
- **WHEN** the admin opens the chip "Extract Document · harel.pdf", or reads the same call in the admin conversation viewer
- **THEN** the modal header shows "harel.pdf" beside the stage name, and the viewer's call line shows "harel.pdf" after the stage key

#### Scenario: Accountant
- **WHEN** an accountant opens their own client's conversation tab
- **THEN** no call rows are shown and no file names of calls are sent to the session
