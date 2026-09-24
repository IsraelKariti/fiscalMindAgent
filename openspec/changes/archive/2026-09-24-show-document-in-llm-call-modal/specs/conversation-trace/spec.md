## ADDED Requirements

### Requirement: An LLM call's modal shows the file it read
When an LLM call recorded the received file it read and that file still exists, the call detail modal (opened from a trace chip, from the admin call browser, or from a call link) SHALL show the actual document next to the call details, inside the same modal, in the same arrangement as the file step modal: the details in one pane and the document in the other, both visible at the same time without closing or leaving the modal. Everything the modal shows today (stage label and key, file label, outcome badge, the when/model/client/attempts/duration fields, token tiles, error, system instruction, history, query, response, schema) SHALL remain, in the details pane. The details pane and the document pane SHALL scroll independently, so a long prompt never pushes the document out of view.

The document pane SHALL show the file as the file step modal shows it: a PDF as a page view the admin can scroll through, an image fitted to the pane, and for any other type a "preview unavailable" note. Above the document the pane SHALL show the file's display name (for a named part of a split PDF: its name plus the stored file name, as the file viewer shows it), a "download" button that saves the file, and an "open full size" button that opens the document alone in a new browser tab. Both buttons SHALL be reachable by keyboard and SHALL carry accessible names. When the file type cannot be previewed, "download" SHALL still work and "open full size" SHALL NOT be offered.

The document SHALL be requested only when the modal opens on that call. Loading the trace, the conversation, the call list or the call's own details SHALL NOT be delayed by the document: while the document's information loads, the details pane SHALL already be shown and the document pane SHALL show a loading note.

On a narrow screen (a phone, or a window too narrow for two readable panes) the document pane SHALL move below the details in the same modal.

A call that recorded no file (for example message drafting, the questionnaire or the planner, and every call recorded before file ids were kept) SHALL keep the single-column modal with no document pane and no document request. A call whose recorded file no longer exists SHALL keep the single-column modal and SHALL show a short "document no longer available" note; the rest of the modal SHALL work as before.

#### Scenario: Extraction call on a PDF
- **WHEN** the admin opens the chip "Extract Document · harel.pdf" in the trace
- **THEN** the modal opens with the call details in one pane and harel.pdf in the other, with "download" and "open full size" above it

#### Scenario: Classification call on a photo
- **WHEN** the admin opens a `File Classification` call whose file is a JPEG photo of a document
- **THEN** the document pane shows the photo fitted to the pane

#### Scenario: Split child
- **WHEN** the admin opens the chip "File Classification · scan.pdf · pages 4-5"
- **THEN** the document pane shows the child file cut out of scan.pdf (pages 4-5 only), named as the child's attachment chip names it

#### Scenario: File that cannot be previewed
- **WHEN** the admin opens a call whose file is a Word document
- **THEN** the document pane shows "preview unavailable", the "download" button saves the file, and there is no "open full size" button

#### Scenario: Call without a file
- **WHEN** the admin opens a `Generate Message` call, or a `File Classification` call recorded before file ids were kept
- **THEN** the modal is the single-column modal, with no document pane and no document request

#### Scenario: File since removed
- **WHEN** the admin opens an `Extract Document` call whose file was deleted after the call ran
- **THEN** the single-column modal opens with all the call details and a "document no longer available" note

#### Scenario: Same modal from the call browser
- **WHEN** the admin opens the same call from the admin call browser or from its call link
- **THEN** the modal shows the details and the document side by side, exactly as from the trace chip

#### Scenario: Nothing loads early
- **WHEN** the admin views a conversation trace with the LLM-calls toggle on, or the admin call browser list
- **THEN** no document is requested until the admin opens one of those calls, and then only that call's document

#### Scenario: Narrow screen
- **WHEN** the admin opens an `Extract Document` call on a phone
- **THEN** the details come first and the document is below them, in the same modal

### Requirement: A call's document is served to admins only
The server SHALL provide an LLM call's document (its name and type, an inline view, and a download) addressed by the call id alone, so it works wherever the call itself can be opened. These responses SHALL be given only to an admin, with the same refusal for a non-admin as the single-call request. An accountant's session SHALL never receive a document this way.

The server SHALL return the document only when the call recorded a received file and that file exists; otherwise it SHALL answer "not found" and SHALL NOT reveal whether the file ever existed beyond that. The inline view SHALL render inline only for PDF, PNG, JPEG, GIF and WebP; every other type SHALL be sent as a download, never inline, and responses SHALL forbid content-type sniffing. The file SHALL be streamed through the server under the admin's session; no public or signed storage link SHALL be issued.

#### Scenario: Admin requests a call's document
- **WHEN** an admin's browser requests the inline view of a `document_extraction` call's file
- **THEN** the server streams the PDF with an inline disposition

#### Scenario: Non-admin requests a call's document
- **WHEN** a signed-in accountant requests the document of any call id
- **THEN** the server refuses exactly as it refuses the single-call request, and sends no file data

#### Scenario: Call without a file
- **WHEN** an admin requests the document of a `generate_message` call
- **THEN** the server answers "not found"

#### Scenario: Unsafe type asked inline
- **WHEN** the inline view is requested for a call whose file is an HTML or SVG file
- **THEN** the server sends it as a download, never inline
