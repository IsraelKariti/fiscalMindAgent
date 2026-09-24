# conversation-trace Specification

## Purpose

The admin-only conversation trace: the code-step rows and LLM call rows woven into a client's timeline (workspace conversation tab under impersonation, and the admin conversation viewer) and what an admin can open from them.

## Requirements

### Requirement: Code gate rows open a checks modal
In both trace surfaces, every code-step row SHALL be clickable (mouse and keyboard) and SHALL open an in-app modal. Browser-native dialogs (alert, confirm, prompt) MUST NOT be used. The modal SHALL show: the step's human label and its technical action key, the time of the step, the overall result badge when the row has one (same wording and colors as the row), and the general reason when the step carries one (the row's existing `reason`).

Beneath that, the modal SHALL show a "what this step did" section: the step's recorded detail rendered as labelled plain-language rows, never only as raw JSON. Document rows SHALL be shown by document name (the recorded name, or the id when the row was written before names were recorded), instance additions by the anchor document and the instance names, retirements and resolutions by document name plus the evidence quote, collections by the names marked collected and claimed and the file-to-document pairs, message steps by channel, message kind and scheduled time, and review steps by channel and scheduled time. Fields the renderer does not know SHALL still be listed generically (key and value) so nothing recorded is hidden. The client's own name, which every row repeats, is omitted. Text values SHALL render in their own writing direction.

When the step's detail carries a `checks` list, the modal SHALL additionally show the ordered list of checks. Each check SHALL show its human label (falling back to the technical key when no label exists), a check mark when it passed, and an X when it failed. Beneath every check that carries an observed value, pass or fail, the modal SHALL show that value, and the expected value next to it when the check has one; a failed check SHALL also show its note.

The raw detail JSON SHALL remain available in a collapsed section. The modal SHALL close from the backdrop and the Escape key; it SHALL NOT have a close button. The copy buttons (see the copy requirements) SHALL sit at the top of the modal, beside the title, never at the bottom. On open, keyboard focus SHALL move into the modal so Escape and Tab work at once. The modal is read-only.

#### Scenario: Failed extraction verification
- **WHEN** an impersonating admin clicks the `verify_extraction` row that shows `result: false`
- **THEN** a modal opens listing every check that ran on that document (for example `legible` ✓, `expected_type` ✓, `as_of_date` ✗), each with the value it inspected (the as-of date read, the amounts found, the subject name), the expected value where there is one, and, under the failed check, the note naming the exact problem (for example "פיקדון -5 ILS is negative")

#### Scenario: Passed gate
- **WHEN** the admin clicks a gate row that shows `result: true`
- **THEN** the modal lists every check with a check mark, its observed (and expected) value, and no notes

#### Scenario: Apply additions
- **WHEN** the admin clicks an `apply_additions` row
- **THEN** the modal shows, for each addition, the anchor document's name and the names of the instances added under it, and no checks section

#### Scenario: Apply retirements
- **WHEN** the admin clicks an `apply_retirements` row
- **THEN** the modal shows, for each retired document, its name and the evidence quote the planner cited, and no checks section

#### Scenario: Old apply row without names
- **WHEN** the admin clicks an `apply_retirements` row recorded before document names were kept in the step detail
- **THEN** the modal opens and lists each retired document by its id

#### Scenario: Review pending
- **WHEN** the admin clicks a `review.message_pending` row
- **THEN** the modal shows the channel and the time the draft was scheduled to go out

#### Scenario: Keyboard
- **WHEN** the admin focuses any step row with the keyboard and presses Enter or Space
- **THEN** the modal opens; pressing Escape closes it

#### Scenario: No close button
- **WHEN** the admin opens any step
- **THEN** the modal shows no close button, the copy buttons are at the top beside the title, and a click on the backdrop closes the modal

### Requirement: Visibility unchanged
The checks modal SHALL be available only where the trace itself is available today: to an admin viewing the trace (impersonation in the workspace, or the admin viewer). An accountant's session SHALL never receive check lists or see the modal.

#### Scenario: Accountant
- **WHEN** an accountant opens their own client's conversation tab
- **THEN** no trace rows, and therefore no gate modal, are shown

### Requirement: Apply steps record what they changed by name
The planner's apply steps SHALL record, in their audit detail, a human-readable name for every document they touched, alongside the id: `apply_resolutions` (document name and verdict per row), `apply_additions` (anchor document name per entry, with the instance names already recorded), `apply_retirements` (document name and evidence quote per row), `apply_collections` (names for the proposed, collected and claimed documents, the file name and document name for each pair, and, when a tie split an item that names no company by company, the renamed item with its old and new name and every created item with its name and the file that created it), and the `document.collected` row (document names). Rows written before this change are not rewritten.

#### Scenario: Retirement recorded with its name
- **WHEN** the planner retires the document "אישור יתרות — בנק הפועלים" with an evidence quote
- **THEN** the `apply_retirements` audit row lists that document with its id, its name and the quote

#### Scenario: Collection recorded with names
- **WHEN** the planner marks two documents collected and links one received file to one of them
- **THEN** the `apply_collections` row lists the two document names under collected, and the pair shows the file name with the document name

#### Scenario: Company split recorded
- **WHEN** the planner ties Harel and Clal files to the item "ביטוח מנהלים ניב" and code splits it by company
- **THEN** the `apply_collections` row lists the rename "ביטוח מנהלים ניב" → "ביטוח מנהלים ניב — הראל", the created item "ביטוח מנהלים ניב — כלל" with the Clal file's name, and the pairs show each file with the item it ended under; the step modal shows these lines

### Requirement: Every step run has its own link
Every code-step run shown in the trace (gate rows and all other step rows) SHALL have a stable link of the form `<site origin>/#/steps/<step id>`, where the step id is the id of the step's audit row. The link SHALL NOT depend on the client, the agent, or the accountant, and SHALL keep working for as long as the audit row exists.

Opening a step link as an admin, whether impersonating or not, SHALL show that step in the step detail modal with the same content as opening it from the trace (label, action key, time, result badge, reason, "what this step did", checks list, raw JSON). Closing the modal SHALL leave the admin on a normal page of the app (the admin overview when not impersonating, the workspace when impersonating), not on a blank page. A link whose id is malformed or matches no step SHALL show an in-app "step not found" message, never a browser-native dialog and never a broken page.

The link adds no new audience: a signed-in user who is not an admin SHALL NOT receive the step's data, and the server SHALL answer a non-admin request for a single step with the same refusal as the other admin endpoints.

#### Scenario: Open a failed gate run from its link
- **WHEN** an admin pastes `https://<site>/#/steps/<id>` of a failed `validate_file_match` run into the browser
- **THEN** the step detail modal opens on that run, showing the failed `issuer_matches_item` check with its observed value, expected value and note

#### Scenario: Open a link while impersonating
- **WHEN** an admin who is impersonating an accountant opens a step link
- **THEN** the modal shows that step, and after closing it the admin is in that accountant's workspace

#### Scenario: Unknown step
- **WHEN** an admin opens a step link whose id matches no audit row
- **THEN** an in-app message says the step was not found, with a way back to the app

#### Scenario: Accountant opens a step link
- **WHEN** a signed-in accountant opens a step link
- **THEN** no step data is shown or sent, and the accountant lands in their own workspace

### Requirement: The step detail modal copies the step's link
The step detail modal SHALL show a "copy link" button at its top, beside the title, on every step, in both trace surfaces and when opened from a step link. Pressing it SHALL copy the step's full link (origin included) to the clipboard and SHALL confirm the copy inside the button (for example a check mark for a moment), without a browser-native dialog. The button SHALL be reachable by keyboard and SHALL carry an accessible name.

#### Scenario: Copy from the workspace trace
- **WHEN** an impersonating admin opens a gate row in the workspace conversation tab and presses "copy link"
- **THEN** the clipboard holds `<site origin>/#/steps/<that step's id>` and the button shows the copied state

#### Scenario: Copy from the admin viewer
- **WHEN** an admin opens an `apply_additions` row in the admin conversation viewer and presses "copy link"
- **THEN** the clipboard holds the link of that step, and opening it shows the same step

### Requirement: The step detail modal copies the step's full details as text
Next to "copy link", the step detail modal SHALL show a "copy details" button on every step, in both trace surfaces and when opened from a step link. Pressing it SHALL copy plain text made of the step's full link on the first line, followed by the step's complete recorded data as formatted JSON: id, time, action key, actor type, severity, target type and id, the suspected-injection flag, and the whole detail object (checks with their observed values, expected values and notes included). Nothing the raw JSON section shows SHALL be missing from the copied text. The text SHALL be complete on its own, so a reader with no access to the site or its database (for example Claude, given a step from production) can understand the run from the paste alone.

The button SHALL confirm the copy inside the button, SHALL NOT use a browser-native dialog, SHALL be reachable by keyboard, and SHALL carry an accessible name distinct from "copy link". It adds no new audience: it exists only inside the admin-only modal.

#### Scenario: Copy a failed gate from production
- **WHEN** an admin on the production site opens a failed `validate_file_match` run and presses "copy details"
- **THEN** the clipboard holds the production link of that step on the first line, then JSON that includes the `issuer_matches_item` check with `passed: false`, its observed value, its expected value and its note

#### Scenario: Copied text matches the raw JSON
- **WHEN** an admin presses "copy details" on any step
- **THEN** the detail object in the copied text equals the one shown in the modal's raw JSON section

#### Scenario: Step without checks
- **WHEN** an admin presses "copy details" on an `apply_retirements` row
- **THEN** the clipboard holds the link and the JSON with the retired documents' names and evidence quotes, and no checks list

### Requirement: A file step shows its document beside the details
A code step is about a received file when its recorded target is a received file, or when its recorded target is a document list item and its recorded details name exactly one received file (today: the verification steps `verify_extraction`, `document.verified`, `document.verification_failed` after a failed check, and `client.spouse_inferred`).

When a code step is about a received file and that file still exists, the step detail modal SHALL show the actual document next to the step details, inside the same modal: the details in one pane and the document in the other, both visible at the same time without closing or leaving the modal. Everything the modal shows today (title, copy buttons, action key, time, result badge, reason, "what this step did", checks, raw JSON) SHALL remain, in the details pane. The details pane and the document pane SHALL scroll independently, so a long checks list never pushes the document out of view.

A PDF SHALL be shown with the browser's own PDF viewer (scrolling, zoom and page navigation as the browser provides them). A PNG, JPEG, GIF or WebP image SHALL be shown as a picture fitted to the pane. Any other file type SHALL show a plain "preview unavailable" note in the pane and SHALL never be rendered inline.

Above the document the pane SHALL show the file's display name (for a named part of a split PDF: its name plus the stored file name, as the file viewer shows it), a "download" button that saves the file, and an "open full size" button that opens the document alone in a new browser tab. Both buttons SHALL be reachable by keyboard and SHALL carry accessible names. When the file type cannot be previewed, "download" SHALL still work and "open full size" SHALL NOT be offered.

The document SHALL be requested only when the modal opens on that step. Loading the trace, the conversation or the step list SHALL NOT request any document. While the document's information loads, the details pane SHALL already be shown and the document pane SHALL show a loading note.

On a narrow screen (a phone, or a window too narrow for two readable panes) the document pane SHALL move below the details in the same modal.

The behavior SHALL be the same in the workspace trace under impersonation, in the admin conversation viewer, and when the modal is opened from a step link, including by an admin who is not impersonating anyone. The modal stays read-only, still closes from the backdrop and the Escape key, still has no close button, and still takes keyboard focus on open. Browser-native dialogs MUST NOT be used.

A step that is not about a received file SHALL keep the single-column modal with no document pane. A file step whose file no longer exists SHALL keep the single-column modal and SHALL show a short "document no longer available" note; the rest of the modal SHALL work as before.

#### Scenario: Failed classification check beside its PDF
- **WHEN** an admin opens the `validate_classification` step of the file `whatsapp-media-1-p1-9.pdf`, whose `issuer_matches_item` check failed with "observed: Harel"
- **THEN** the modal shows the checks on one side and the PDF itself on the other, so the admin reads the company name on the page while the failed check is still in view

#### Scenario: Failed extraction check beside its PDF
- **WHEN** an admin opens the `verify_extraction` step of a pension balance list item, whose result is "false" and whose details name the file the extraction read
- **THEN** the modal shows the checks on one side and that file's PDF on the other

#### Scenario: Verified document step
- **WHEN** an admin opens the `document.verified` step of a list item
- **THEN** the modal shows the file the verification approved beside the details

#### Scenario: Image file
- **WHEN** the admin opens a file step whose file is a JPEG photo of a document
- **THEN** the document pane shows the photo fitted to the pane

#### Scenario: File type that cannot be previewed
- **WHEN** the admin opens a file step whose file is a spreadsheet
- **THEN** the document pane shows "preview unavailable", the "download" button saves the file, and there is no "open full size" button

#### Scenario: Step about a split PDF
- **WHEN** the admin opens the `validate_file_split` step of a multi-document PDF
- **THEN** the document pane shows the original PDF that was split

#### Scenario: Step that is not about a file
- **WHEN** the admin opens an `apply_retirements` step
- **THEN** the modal is the single-column modal, with no document pane and no document request

#### Scenario: List-item step that names no file
- **WHEN** the admin opens a `planner.rerun_after_verification` step, whose target is a list item and whose details list documents but name no single file
- **THEN** the modal is the single-column modal, with no document pane and no document request

#### Scenario: File no longer exists
- **WHEN** the admin opens a file step whose file was deleted with its client
- **THEN** the single-column modal opens with all the recorded details and a "document no longer available" note

#### Scenario: Opened from a step link without impersonation
- **WHEN** an admin who is not impersonating anyone pastes the step link of a file step into the browser
- **THEN** the modal opens with the details and the document side by side

#### Scenario: Nothing loads before the modal opens
- **WHEN** an admin opens a client's conversation with forty file steps in its trace
- **THEN** no document is requested until the admin opens one of those steps, and then only that step's document

#### Scenario: Narrow screen
- **WHEN** the admin opens a file step on a phone
- **THEN** the details come first and the document is below them, in the same modal

#### Scenario: Open full size
- **WHEN** the admin presses "open full size" on a PDF
- **THEN** the PDF opens alone in a new browser tab and the modal stays open behind it

### Requirement: A step's document is served to admins only
The server SHALL provide a step's document (its name and type, an inline view, and a download) addressed by the step id alone, so it works wherever the step itself can be opened. These responses SHALL be given only to an admin, with the same refusal for a non-admin as the single-step request. An accountant's session SHALL never receive a document this way.

The server SHALL return the document only when the step is about a received file and that file exists: the step's recorded target is a received file, or the step's recorded target is a document list item and its recorded details name exactly one received file that belongs to the same client as the step. Otherwise it SHALL answer "not found" and SHALL NOT reveal whether the file ever existed beyond that. The inline view SHALL render inline only for PDF, PNG, JPEG, GIF and WebP; every other type SHALL be sent as a download, never inline, and responses SHALL forbid content-type sniffing. The file SHALL be streamed through the server under the admin's session; no public or signed storage link SHALL be issued.

#### Scenario: Admin requests a step's document
- **WHEN** an admin's browser requests the inline view of a `validate_classification` step's file
- **THEN** the server streams the PDF with an inline disposition

#### Scenario: Admin requests a verification step's document
- **WHEN** an admin's browser requests the inline view of a `verify_extraction` step's file
- **THEN** the server streams the file named in the step's details with an inline disposition

#### Scenario: Named file belongs to another client
- **WHEN** an admin requests the document of a list-item step whose details name a file of a different client
- **THEN** the server answers "not found" and sends no file data

#### Scenario: Non-admin requests a step's document
- **WHEN** a signed-in accountant requests the document of any step id
- **THEN** the server refuses exactly as it refuses the single-step request, and sends no file data

#### Scenario: Step without a file
- **WHEN** an admin requests the document of an `apply_additions` step
- **THEN** the server answers "not found"

#### Scenario: Unsafe type asked inline
- **WHEN** the inline view is requested for a step whose file is an HTML or SVG file
- **THEN** the server sends it as a download, never inline

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
