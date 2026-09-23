## MODIFIED Requirements

### Requirement: The conversation shows the original file and the files cut from it
In the client's conversation view, the message a split file arrived on SHALL show only the original file as an attachment, never a child cut from it. The children SHALL NOT appear on any message bubble, and the "copy conversation" text SHALL list only the original under that message.

The child files SHALL be shown on the admin trace row of the split step (`validate_file_split`) that cut the original: that row SHALL list every child as an attachment chip, in page order, beneath the step's usual content (time, action key, result badge, reason). The attachment label of a child with no display name SHALL be the original's label followed by the child's page range (for example "scan.pdf · pages 3-5"). The attachment label of a child with a display name SHALL be the display name, then the original's label, then the page range (for example "אישור יתרות - בנק לאומי · scan.pdf · pages 1-2"). Opening a child chip SHALL open the child file, which holds only its own pages, and SHALL NOT open the step detail modal. The step row SHALL still open the step detail modal when clicked outside the chips.

A split step row whose run cut nothing (rejected answer, one document, or a failed cut) SHALL show no chips. The chips are part of the trace and SHALL be visible only where the trace is visible today (an admin with the code-steps toggle on); an accountant's session SHALL NOT receive or show them, and sees the child files only in the documents list.

#### Scenario: Split file in the conversation
- **WHEN** a client's message carried "scan.pdf" and it was split into pages 1-3 and pages 4-5, and neither child has a display name
- **THEN** the message shows one attachment, "scan.pdf", and the `validate_file_split` row of that file, when the admin's code-steps toggle is on, shows two chips: "scan.pdf · pages 1-3" and "scan.pdf · pages 4-5"

#### Scenario: Named child in the conversation
- **WHEN** the child covering pages 1-3 of "scan.pdf" has the display name "אישור יתרות - בנק לאומי"
- **THEN** its chip on the split step row reads "אישור יתרות - בנק לאומי · scan.pdf · pages 1-3", and the other chip still reads "scan.pdf · pages 4-5"

#### Scenario: Opening a child from the step row
- **WHEN** the admin clicks the chip "scan.pdf · pages 4-5" on the split step row
- **THEN** the file view opens on the child file holding pages 4-5 only, and the step detail modal does not open

#### Scenario: Accountant's view
- **WHEN** an accountant opens the conversation of a client whose "scan.pdf" was split into two children
- **THEN** the client's message shows only "scan.pdf", no trace rows are shown, and the two children are listed only on the Documents tab

#### Scenario: Copy conversation
- **WHEN** an admin copies the conversation of a client whose "scan.pdf" was split
- **THEN** the copied text lists "scan.pdf" as the only attachment of that message

#### Scenario: Split step that cut nothing
- **WHEN** the split gate accepted a one-document answer for a three-page PDF
- **THEN** the `validate_file_split` row shows its result badge and no chips

#### Scenario: File that was not split
- **WHEN** a client's message carried a one-page PDF
- **THEN** the message shows that one attachment, as before
