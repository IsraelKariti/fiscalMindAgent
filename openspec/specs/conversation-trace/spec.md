# conversation-trace Specification

## Purpose

The admin-only conversation trace: the code-step rows and LLM call rows woven into a client's timeline (workspace conversation tab under impersonation, and the admin conversation viewer) and what an admin can open from them.

## Requirements

### Requirement: Code gate rows open a checks modal
In both trace surfaces, every code-step row SHALL be clickable (mouse and keyboard) and SHALL open an in-app modal. Browser-native dialogs (alert, confirm, prompt) MUST NOT be used. The modal SHALL show: the step's human label and its technical action key, the time of the step, the overall result badge when the row has one (same wording and colors as the row), and the general reason when the step carries one (the row's existing `reason`).

Beneath that, the modal SHALL show a "what this step did" section: the step's recorded detail rendered as labelled plain-language rows, never only as raw JSON. Document rows SHALL be shown by document name (the recorded name, or the id when the row was written before names were recorded), instance additions by the anchor document and the instance names, retirements and resolutions by document name plus the evidence quote, collections by the names marked collected and claimed and the file-to-document pairs, message steps by channel, message kind and scheduled time, and review steps by channel and scheduled time. Fields the renderer does not know SHALL still be listed generically (key and value) so nothing recorded is hidden. The client's own name, which every row repeats, is omitted. Text values SHALL render in their own writing direction.

When the step's detail carries a `checks` list, the modal SHALL additionally show the ordered list of checks. Each check SHALL show its human label (falling back to the technical key when no label exists), a check mark when it passed, an X when it failed, and a neutral glyph (a dash) when it was skipped (`passed: null`). A skipped check SHALL show the word "לא נבדק" in place of the pass/fail wording and, beneath it, the skip reason recorded in its note, in a muted style that is clearly not a failure. Beneath every check that carries an observed value, pass or fail, the modal SHALL show that value, and the expected value next to it when the check has one; a failed check SHALL also show its note. The section heading SHALL state how many checks ran and how many were skipped when at least one was skipped (for example "5 נבדקו · 5 לא נבדקו"). A row recorded before skipped entries were kept SHALL render as before, with only the checks it carries. A row recorded before the generic amounts check was removed SHALL still show its `amounts` entry with its human label.

The raw detail JSON SHALL remain available in a collapsed section. The modal SHALL close from the backdrop and the Escape key; it SHALL NOT have a close button. The copy buttons (see the copy requirements) SHALL sit at the top of the modal, beside the title, never at the bottom. On open, keyboard focus SHALL move into the modal so Escape and Tab work at once. The modal is read-only.

#### Scenario: Failed extraction verification
- **WHEN** an impersonating admin clicks the `verify_extraction` row that shows `result: false`
- **THEN** a modal opens listing every check of the document type in order (for example `legible` ✓, `expected_type` ✓, `as_of_date` ✗), each ran check with the value it inspected (the as-of date read, the typed values by their Hebrew labels, the subject name), the expected value where there is one, and, under the failed check, the note naming the exact problem (for example "השדה "יתרת פיקדונות וחסכונות" שלילי (-5)")

#### Scenario: Skipped checks in an extraction verification
- **WHEN** the admin clicks a `verify_extraction` row for a bank balance document whose owner prints no id number
- **THEN** the modal lists ten checks; `id_checksum`, `id_matches_client`, `client_id_on_file`, `spouse_adopted` and `co_owners` show a dash glyph, the word "לא נבדק" and a muted reason such as "במסמך לא מודפס מספר תעודת זהות של בעלים"; the section heading says five checks ran and five were skipped; the result badge reflects only the five that ran

#### Scenario: Passed gate
- **WHEN** the admin clicks a gate row that shows `result: true`
- **THEN** the modal lists every ran check with a check mark, its observed (and expected) value, and no failure notes; skipped checks, if any, show the dash glyph and their skip reason

#### Scenario: Old row without skipped entries
- **WHEN** the admin clicks a `verify_extraction` row recorded before skipped checks were kept
- **THEN** the modal lists only the checks the row carries, with check marks and X marks as before, and no skipped count in the heading

#### Scenario: Old row with an amounts entry
- **WHEN** the admin clicks a `verify_extraction` row recorded before the generic amounts check was removed
- **THEN** the modal lists its `amounts` entry with its label, observed amounts and note as recorded, between `as_of_date` and `type_fields`

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
The planner's tool-call steps SHALL record, in their audit detail, a human-readable name for every document and file they touched, alongside the id: `resolve_document` (document name, verdict, quote or the self-evident file that settled it, and the instance names for a required resolution), `add_instance` (anchor document name, the created rows' names, the files assigned to them), `retire_document` (document name and evidence quote), `state_cost` (document name, amount, currency and evidence quote — the `chat-stated-cost` capability), `state_vehicle` (document name and the stated facts), `tie_file` (file name and document name, the split it caused with the renamed item's old and new name and every created item with its name, file and employer, or the refusal reason), `mark_collected` (document name and whether it became collected or claimed or stayed pending), and the `document.collected` row (document names). Rows written before this change are not rewritten.

#### Scenario: Retirement recorded with its name
- **WHEN** the planner retires the document "אישור יתרות — בנק הפועלים" with an evidence quote
- **THEN** the `retire_document` step lists that document with its id, its name and the quote

#### Scenario: Stated cost recorded with its name
- **WHEN** the planner states 85000 ILS on the document "הצהרת עלות — מאזדה 3" with the quote "אין לי את הקבלה, שילמתי 85,000 ש"ח"
- **THEN** the `state_cost` step lists that document with its id, its name, 85000, ILS and the quote, and the step modal shows these lines

#### Scenario: Collection recorded with names
- **WHEN** the planner marks two documents collected and ties one received file to one of them
- **THEN** each `mark_collected` step names its document and its outcome, and the `tie_file` step shows the file name with the document name

#### Scenario: Company split recorded
- **WHEN** the planner ties Harel and Clal files to the item "ביטוח מנהלים ניב" and code splits it by company
- **THEN** the Harel `tie_file` step lists the rename "ביטוח מנהלים ניב" → "ביטוח מנהלים ניב — הראל", the Clal `tie_file` step lists the created item "ביטוח מנהלים ניב — כלל" with the Clal file's name, and each step names the item its file ended under; the step modal shows these lines

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
- **WHEN** the admin opens a file step whose file was removed on its own after the step ran (a split source cleaned up, a failed upload); deleting the client no longer removes files
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

### Requirement: Every LLM call has its own link
Every LLM call shown in the trace (the call chips in the workspace conversation tab under impersonation and in the admin conversation viewer) and in the admin call browser SHALL have a stable link of the form `<site origin>/#/llm-calls/<call id>`, where the call id is the id of the call's `llm_calls` row. The link SHALL NOT depend on the client, the agent, or the accountant, and SHALL keep working for as long as the call row exists.

Opening a call link as an admin, whether impersonating or not, SHALL show that call in the call detail modal with the same content as opening it from a trace chip (stage label and key, file label, outcome badge, when/model/client/attempts/duration, token tiles, error, system instruction, history, query, response, schema, and the document pane when the call read a file). Closing the modal SHALL leave the admin on a normal page of the app (the admin call browser when not impersonating, as today; the workspace when impersonating), not on a blank page. A link whose id is malformed or matches no call SHALL show an in-app "call not found" message, never a browser-native dialog and never a broken page.

The link adds no new audience: a signed-in user who is not an admin SHALL NOT receive the call's data, and the server SHALL answer a non-admin request for a single call with the same refusal as the other admin endpoints.

#### Scenario: Open a call link while impersonating
- **WHEN** an admin who is impersonating an accountant opens `https://<site>/#/llm-calls/<id>` of a `file_classification` call
- **THEN** the call detail modal opens on that call, showing its prompt, response and the document it read, and after closing it the admin is in that accountant's workspace

#### Scenario: Open a call link without impersonation
- **WHEN** an admin who is not impersonating anyone opens a call link
- **THEN** the call detail modal opens over the admin call browser, as it does today

#### Scenario: Unknown call
- **WHEN** an impersonating admin opens a call link whose id matches no call row
- **THEN** an in-app message says the call was not found, with a way back to the app

#### Scenario: Accountant opens a call link
- **WHEN** a signed-in accountant opens a call link
- **THEN** no call data is shown or sent, and the accountant lands in their own workspace

### Requirement: The call detail modal copies the call's link
The call detail modal SHALL show a "copy link" button at its top, beside the title, on every call, wherever the modal is opened (trace chip in either trace surface, admin call browser, call link). Pressing it SHALL copy the call's full link (origin included) to the clipboard and SHALL confirm the copy inside the button (for example a check mark for a moment), without a browser-native dialog. The button SHALL be reachable by keyboard and SHALL carry an accessible name.

#### Scenario: Copy from the workspace trace
- **WHEN** an impersonating admin opens a call chip in the workspace conversation tab and presses "copy link"
- **THEN** the clipboard holds `<site origin>/#/llm-calls/<that call's id>` and the button shows the copied state

#### Scenario: Copy from the admin call browser
- **WHEN** an admin opens a call in the admin call browser and presses "copy link"
- **THEN** the clipboard holds the link of that call, and opening it shows the same call

### Requirement: The call detail modal copies the call's full details as text
Next to "copy link", the call detail modal SHALL show a "copy details" button on every call, wherever the modal is opened. Pressing it SHALL copy plain text made of the call's full link on the first line, followed by the call's complete recorded data as formatted JSON: id, time, stage key (`purpose`), provider, model, status and error, attempts, duration, the four token counts with their prices and the cost, client id and name, agent instance id, the file id and name the call read, the whole request (model, system instruction, contents, config including the response schema) and the raw response text. Nothing the modal shows SHALL be missing from the copied text. The text SHALL be complete on its own, so a reader with no access to the site or its database (for example Claude, given a call from production) can understand the call from the paste alone.

The button SHALL confirm the copy inside the button, SHALL NOT use a browser-native dialog, SHALL be reachable by keyboard, and SHALL carry an accessible name distinct from "copy link". It adds no new audience: it exists only inside the admin-only modal.

#### Scenario: Copy a failed call from production
- **WHEN** an admin on the production site opens a `verify_extraction` call that ended in error and presses "copy details"
- **THEN** the clipboard holds the production link of that call on the first line, then JSON that includes `status: "error"`, the error text, the system instruction and the query the model received

#### Scenario: Copied text matches the modal
- **WHEN** an admin presses "copy details" on any call
- **THEN** the system instruction, contents, schema and response in the copied text equal the ones the modal's panes show

#### Scenario: Call without a file
- **WHEN** an admin presses "copy details" on a `planner` call
- **THEN** the copied JSON carries `documentFileId: null` and `documentFileName: null`, and everything else is present

### Requirement: Discarded drafts are shown with the LLM calls
A draft the agent threw away in a re-plan (a "regenerate" by the admin, a reply that arrived before the send, a resume that redrafted) SHALL stay part of the admin trace. While the **LLM calls** toggle of the workspace timeline is on, the timeline SHALL show every discarded draft of the client as a muted outbound bubble, in time order by the moment the draft was written, carrying the draft's text and a "discarded draft" badge. The bubble SHALL offer no action: no approve, no send now, no regenerate, no pause.

While the **LLM calls** toggle is on, the `generate_message` call that wrote a discarded draft SHALL show like any other call row. The `send_reply` step of a discarded draft SHALL show only while both toggles (LLM calls and code steps) are on.

With the **LLM calls** toggle off, the timeline SHALL look exactly as before: no discarded draft, no call that only produced one, no step of one. Discarded drafts SHALL never count in the timeline's message count and SHALL never be shown to an accountant, who has no trace toggle.

#### Scenario: Admin regenerates a scheduled draft
- **WHEN** an impersonating admin presses "regenerate" on a scheduled draft and the agent writes a new one, with the LLM calls toggle on
- **THEN** the old draft stays in the timeline as a muted bubble with the "discarded draft" badge, placed at the time it was written, and the new draft shows as the scheduled bubble after it

#### Scenario: Admin regenerates from the review queue
- **WHEN** an admin presses "regenerate" on a message in the review queue and later opens that client's conversation with the LLM calls toggle on
- **THEN** the regenerated-away draft shows as a discarded-draft bubble, and the draft now waiting for approval shows as the live scheduled bubble

#### Scenario: Several regenerations
- **WHEN** the admin regenerated the same message three times
- **THEN** the three old drafts show as three discarded-draft bubbles in the order they were written, each with its own `generate_message` call row before it

#### Scenario: Toggle off
- **WHEN** the LLM calls toggle is off
- **THEN** no discarded draft, no call that only produced a discarded draft, and no step of a discarded draft is shown, and the message count is unchanged

#### Scenario: Only code steps on
- **WHEN** the code steps toggle is on and the LLM calls toggle is off
- **THEN** the `send_reply` step of a discarded draft stays hidden

#### Scenario: Both toggles on
- **WHEN** both toggles are on
- **THEN** the discarded draft shows with its `generate_message` call before it and its `send_reply` step after it

#### Scenario: No action on a discarded draft
- **WHEN** a discarded-draft bubble is shown
- **THEN** it offers no approve, send now, regenerate or pause control, and the live scheduled bubble keeps its own controls as today

#### Scenario: Accountant
- **WHEN** an accountant opens the conversation tab of a client whose draft was regenerated
- **THEN** no discarded draft is shown and the message count is unchanged

#### Scenario: Admin conversation viewer
- **WHEN** an admin opens the same client in the admin conversation viewer
- **THEN** the discarded drafts show there as before, with their "discarded draft" badge

### Requirement: The call record keeps the request as the provider received it
Every LLM call record SHALL store, alongside the request as the code declared it, the parts of the request that the provider adapter changed before sending: the answer schema as sent (for a stage that answers with one JSON object) or the tool set as sent (for a tool-call stage, each tool with its strict flag), and the names of the declared request fields the adapter left out (for example `temperature`). The record SHALL name the provider that received the request. A provider whose adapter sends the request exactly as declared (Gemini today) SHALL record no sent copy. The sent copy SHALL be served only where the declared request is served today (the admin call endpoints); an accountant's session SHALL NOT receive it.

#### Scenario: Anthropic call with a nullable field
- **WHEN** the injection screen runs on an Anthropic model and the declared schema has `evidence: string or null`, required
- **THEN** the call record's sent schema shows `evidence` as a plain string that is not in `required`, names Anthropic as the provider, and lists `temperature` as left out

#### Scenario: OpenAI planner call
- **WHEN** the planner runs on an OpenAI model
- **THEN** the call record's sent tool set shows every tool with `strict: true` and `additionalProperties: false`, and lists `temperature` as left out

#### Scenario: Gemini call
- **WHEN** any stage runs on a Gemini model
- **THEN** the call record carries no sent copy, and the modal treats the declared request as the sent one

### Requirement: The call detail modal shows the schema as sent
The call detail modal's answer-schema pane SHALL show the schema the provider received, and its heading SHALL say which provider received it. When the sent schema differs from the declared one, the modal SHALL also offer the declared schema in a collapsed section labelled as the version in the code, so both can be read without leaving the modal. For a tool-call stage the tools pane SHALL behave the same way: the tools as sent, the declared tools collapsed when they differ. A call recorded before the sent copy existed SHALL show the declared schema with a note that the sent version was not recorded. "Copy details" SHALL include the sent copy next to the declared request, so the pasted text shows both.

#### Scenario: Admin opens the injection screen call from 2026-10-14
- **WHEN** an admin opens an Anthropic injection-screen call made after this change
- **THEN** the schema pane heading names Anthropic, shows `"evidence": { "type": "string" }` with `required: ["suspected_injection"]`, and the collapsed section shows the declared `["string", "null"]` version with both fields required

#### Scenario: Old call
- **WHEN** an admin opens a call recorded before this change
- **THEN** the schema pane shows the declared schema and a note that the sent version was not recorded, with no empty section

#### Scenario: Copy details
- **WHEN** the admin presses "copy details" on a call that carries a sent copy
- **THEN** the pasted JSON contains the sent schema or tools and the omitted fields next to the declared request

### Requirement: Adapter translations are code steps in the trace
For every LLM call that a provider adapter translated, the trace SHALL show two code-step rows under the code-steps toggle: a request-translation step recorded before the call, and an answer-restore step recorded after it, each attributed to the client of the call and each opening the step detail modal like every other code step. A call whose adapter sent the request exactly as declared and changed nothing in the answer SHALL record no such steps.

The request-translation step SHALL list, as labelled rows: the provider, the stage, the fields that lost their null option (by path), the fields removed from the required list, the schema keywords stripped (by keyword and path), the request fields left out, and whether the tools were marked strict. A translation that changed nothing in the schema but left out request fields SHALL still be recorded and SHALL say the schema is unchanged.

The answer-restore step SHALL list the nullable fields the adapter filled with null because the model left them out (by path), or say that nothing was filled. The step SHALL NOT alter the answer; it reports what the adapter did.

Both steps carry no result badge and no checks; they are informational and never fail a call.

#### Scenario: Anthropic injection screen
- **WHEN** the injection screen runs on an Anthropic model and the model leaves `evidence` out
- **THEN** the trace shows, in time order, the translation step ("null removed: evidence; removed from required: evidence; left out: temperature"), the `Injection Screen` call chip, the restore step ("filled with null: evidence"), then the `validate_injection_scan` gate row

#### Scenario: Anthropic answer that holds text in a nullable field
- **WHEN** the model writes the text `"null"` into `evidence` instead of leaving the field out
- **THEN** the restore step says nothing was filled, and the following gate row shows the failed check as today

#### Scenario: OpenAI planner
- **WHEN** the planner runs on an OpenAI model
- **THEN** the translation step says the tools were marked strict and `temperature` was left out, and the restore step is not recorded because the adapter changes nothing in the answer

#### Scenario: Gemini
- **WHEN** any stage runs on a Gemini model
- **THEN** no translation or restore step is recorded

#### Scenario: Accountant
- **WHEN** an accountant opens their own client's conversation tab
- **THEN** the two steps are not shown, like every other code step

### Requirement: Every message bubble is addressable
Every message bubble in the workspace conversation (inbound and outbound, both trace surfaces) SHALL carry a stable anchor derived from the message id, so another part of the workspace can scroll to that message and highlight it. Highlighting SHALL be a brief visual emphasis of the bubble in the app's theme, never a browser dialog, and SHALL not move the conversation's auto-scroll position afterwards.

#### Scenario: Scroll to a message
- **WHEN** the documents card asks the conversation to show the message a stated cost rests on
- **THEN** the Conversation tab is shown, the list scrolls so that bubble is in view, and the bubble is emphasised for a moment

#### Scenario: Message missing
- **WHEN** the requested message id matches no bubble in the loaded conversation
- **THEN** nothing scrolls, nothing is highlighted, and no error is shown

### Requirement: Accountant notifications are recorded in full
Every email the platform sends to the accountant about a client (all documents collected, documents claimed outside the chat, a document that failed verification, a passed due date) SHALL be recorded as a code step on that client's trace, with the kind of notification, the recipient address, the subject, the full body text and the mail provider's message id. When the send was blocked by the outbound fence (sandbox), the row SHALL record the fence's stand-in id so the trace shows that nothing left the platform. When the send fails, a warning step of its own SHALL be recorded with the same content and the error text, and the failure SHALL NOT stop the planning cycle or the route that triggered it. Rows written before this change are not rewritten.

#### Scenario: Goal complete email recorded
- **WHEN** the planner marks a client's collection complete and emails the accountant
- **THEN** the trace holds an `email.accountant_sent` step right after `send_closing`, whose detail carries kind `goal_complete`, the accountant's address, the subject "כל המסמכים של <client> התקבלו", the body text and the provider's message id

#### Scenario: Send blocked by the sandbox fence
- **WHEN** the accountant's address is not on the sandbox allowlist
- **THEN** the step is recorded with the body and a stand-in id that marks the send as blocked, and no email leaves the platform

#### Scenario: Send fails
- **WHEN** the mail provider rejects the send
- **THEN** the trace holds an `email.accountant_failed` step with warning severity, the same recipient, subject and body, and the error text; the client's goal stays complete and the cycle ends normally

### Requirement: Accountant-email rows are recognisable in the trace
In both trace surfaces an accountant-email step (sent or failed) SHALL show an envelope glyph instead of the gate glyph and SHALL show the email's subject on the row. A failed row SHALL use the warning styling the trace already uses for warning steps. The rows SHALL be visible only where the trace is visible today (admin impersonation, admin viewer); an accountant's own session SHALL never see them.

#### Scenario: Row in the timeline
- **WHEN** an impersonating admin opens the conversation tab of a completed client
- **THEN** the trace shows a row with an envelope glyph, the action key `email.accountant_sent`, and the subject "כל המסמכים של <client> התקבלו"

#### Scenario: Accountant
- **WHEN** the accountant opens the same client's conversation tab in their own session
- **THEN** no accountant-email row is shown

### Requirement: The step modal shows the accountant email and its delivery status
Opening an accountant-email step SHALL open the existing step detail modal. Its "what this step did" section SHALL show the kind of notification in plain words, the recipient address, the subject and the body as multi-line text in its own writing direction, never only as raw JSON. Above the body the modal SHALL show a delivery status badge. For a sent row the status SHALL be read from the mail provider when the modal opens, keyed by the step id through an admin-only route, and shown as one of: delivered (success colour), sent or queued (neutral), bounced, failed, complained or suppressed (danger colour), with the provider's own event word in a technical font beside the Hebrew label. While the status is loading the badge SHALL say so. A row whose send was blocked by the sandbox fence SHALL show a muted "blocked by the sandbox fence" status without asking the provider. A row recorded before the provider id was kept, or a row whose provider lookup fails, SHALL show a muted "status not available" badge and the rest of the modal SHALL render normally. A failed row SHALL show a danger "not sent" badge and the error text, and SHALL NOT ask the provider. The copy-details text of the row SHALL include the body as recorded. The route SHALL answer only for an accountant-email step (404 otherwise) and only to an admin session.

#### Scenario: Delivered email
- **WHEN** the admin clicks an `email.accountant_sent` row whose email the provider reports as delivered
- **THEN** the modal shows "goal complete" as the kind, the accountant's address, the subject, the full body, and a success badge reading "נמסר" with `delivered` beside it

#### Scenario: Bounced email
- **WHEN** the provider reports the email as bounced
- **THEN** the modal shows a danger badge reading "חזר" with `bounced` beside it

#### Scenario: Old row
- **WHEN** the admin clicks an `email.accountant_sent` row recorded before this change
- **THEN** the modal shows the recipient and the subject, no body, and a muted "status not available" badge

#### Scenario: Failed send
- **WHEN** the admin clicks an `email.accountant_failed` row
- **THEN** the modal shows a danger "not sent" badge, the error text, and the email content that was meant to go out

#### Scenario: Status route for another step
- **WHEN** the status route is asked for a step that is not an accountant email
- **THEN** it answers 404 and the modal of that step shows no status badge

### Requirement: Every LLM call row shows its cost in a pill
In the workspace conversation tab under impersonation, while the **LLM calls** toggle and the **costs** toggle are both on, every LLM call row SHALL show, to the right of the call chip and outside it, a small pill with the call's recorded cost in USD, formatted as the call detail modal and the admin call browser format a cost (for example `$0.0042`, `<$0.0001`, `$1.25`). The pill SHALL show the cost the call recorded at call time, never a value recomputed from today's prices. A call with no recorded cost (its model had no price when the call ran) SHALL show a pill reading `—` whose hover text says the call is unpriced. A failed call SHALL show its pill like any other call. Clicking the pill SHALL do nothing beyond what clicking the row does today; the chip SHALL keep opening the call detail modal.

#### Scenario: Priced call
- **WHEN** an admin views a conversation with the LLM calls and costs toggles on and a `generate_message` call recorded a cost of 0.0042 USD
- **THEN** that call's row shows the chip "Generate Message" and, to its right, a pill reading `$0.0042`

#### Scenario: Unpriced call
- **WHEN** a call ran on a model the pricing registry did not know, so its cost is empty
- **THEN** its pill reads `—` and its hover text says the call has no price

#### Scenario: Failed call
- **WHEN** a call ended in an error after consuming tokens
- **THEN** its row shows the error chip as today and the cost pill with the recorded cost

#### Scenario: Discarded draft's call
- **WHEN** a `generate_message` call wrote a draft that a re-plan later discarded, and the LLM calls toggle is on
- **THEN** its row shows the cost pill like any other call row

### Requirement: A costs toggle shows and hides the pills
The trace toolbar of the workspace conversation tab SHALL show a third toggle, labelled "costs" in Hebrew, beside the **LLM calls** and **code steps** toggles. It SHALL be shown only while the **LLM calls** toggle is on. When the costs toggle is off, no call row shows a cost pill and the rows look exactly as before this change; the cost SHALL still appear in the chip's hover text. The costs toggle SHALL be on the first time an admin opens the trace in a browser, and its last position SHALL be remembered per browser, as the other two trace toggles are.

#### Scenario: Hide the costs
- **WHEN** the admin turns the costs toggle off
- **THEN** every cost pill disappears and the call chips stay, with the cost still in each chip's hover text

#### Scenario: LLM calls off hides the toggle
- **WHEN** the admin turns the LLM calls toggle off
- **THEN** the costs toggle is not shown, and no call rows are shown

#### Scenario: Remembered position
- **WHEN** the admin turns the costs toggle off, reloads the page and reopens a client's conversation tab with the LLM calls toggle on
- **THEN** the costs toggle is still off and no pills are shown

#### Scenario: First time on
- **WHEN** an admin opens the trace in a browser that never stored a costs choice and turns the LLM calls toggle on
- **THEN** the costs toggle is on and the pills are shown

### Requirement: Costs are shown to admins only
The costs toggle and the cost pills SHALL exist only where the trace exists today: for an admin viewing the workspace conversation tab under impersonation. An accountant's session, and a staff member's session of an accountant, SHALL never see the toggle, the pills, or any per-call cost, and the server SHALL keep serving per-call costs only on the admin conversation endpoint that refuses a non-admin session.

#### Scenario: Accountant
- **WHEN** an accountant or one of their staff opens a client's conversation tab
- **THEN** no trace toggles, no call rows and no cost pills are shown

#### Scenario: Admin impersonating
- **WHEN** an admin opens the same client's conversation tab under impersonation with the LLM calls toggle on
- **THEN** the costs toggle and the cost pills are shown

### Requirement: Every accepted tool call is executed and recorded as its own step
After the `validate_message` gate accepts a planner answer, the system SHALL execute the answer's tool calls one by one, in a fixed safe order (checklist changes, then the attestation confirmation, then file ties and collections, then the conclusion, then the message and the fetch action), and SHALL record one code step per tool call, named exactly after the tool: `resolve_document`, `add_instance`, `retire_document`, `state_cost`, `state_vehicle`, `attestation`, `tie_file`, `mark_collected`, `send_whatsapp_text`, `send_whatsapp_template`, `tax_fetch`, `conclude`. Each step SHALL record the time it ran, the call's parameters with every document and file id accompanied by its name, and the outcome of the execution. A call that changed nothing SHALL still get its step, with the outcome saying why (for example "already settled", "refused: papers differ"). The old group steps `apply_resolutions`, `apply_additions`, `apply_retirements`, `apply_stated_costs`, `apply_vehicle_declarations`, `apply_attestation`, `apply_collections`, `send_reply` and `withhold_reply` SHALL NOT be written any more; rows written before this change stay readable as they are. The gate SHALL keep checking the whole answer before any call runs, and a rejected answer SHALL execute nothing.

#### Scenario: Collect cycle
- **WHEN** the planner answers `tie_file(file F, document D)`, `mark_collected(D)`, `conclude(collect)` and the gate accepts
- **THEN** the trace shows, after the `validate_message` row, a `tie_file` step (file name, document name, outcome tied), a `mark_collected` step (document name, outcome collected), and a `conclude` step (decision collect, reply withheld, verification of D on F started), each with its own time, and no `apply_collections` or `withhold_reply` row

#### Scenario: Follow-up cycle
- **WHEN** the planner answers `resolve_document(D, not_required, quote)`, `send_whatsapp_text(text, send_at)`, `conclude(follow_up)` and the gate accepts
- **THEN** the trace shows a `resolve_document` step (document name, verdict, quote), a `conclude` step (decision follow_up), and a `send_whatsapp_text` step (scheduled time, whether it was rolled off a weekend or resolved from `asap`, the draft's id, text length), and no `apply_resolutions` or `send_reply` row

#### Scenario: Rejected answer
- **WHEN** the gate rejects the answer and the corrective retry is accepted
- **THEN** only the retry's calls have steps; the rejected answer's calls have none

#### Scenario: Old trail
- **WHEN** an admin opens a client whose cycles ran before this change
- **THEN** the `apply_*`, `send_reply` and `withhold_reply` rows still show with their current labels and detail rows

### Requirement: Code outcomes are recorded on the tool call they belong to
When code adds an outcome on top of a call, that outcome SHALL be recorded on that call's step, never on a step of its own: a `tie_file` step SHALL say whether the pair was tied, re-pointed to a row the per-company or per-employer split created (with the rename of the item, its old and new name, and every created sibling with its name, file and employer), or refused with the reason (company differs, paper differs, file quarantined, split parent); a `mark_collected` step SHALL say whether the document became collected, became claimed (no file proves it), or stayed pending because its tie was refused or it was not pending; an `add_instance` step SHALL list the created rows with their names, the files code assigned to them, and whether a row was born claimed; a `send_whatsapp_text` or `send_whatsapp_template` step SHALL record the requested time, the scheduled time, whether it was rolled off a weekend or chag or resolved from `asap`, the draft id and, for a template, its name and variables; an `attestation` step SHALL record its action and, for a request, the draft it rides on.

#### Scenario: Three companies for one item
- **WHEN** the planner ties three children of one PDF, from Harel, Clal and Migdal, to the item "ביטוח מנהלים ניב", which names no company
- **THEN** the first `tie_file` step records the rename "ביטוח מנהלים ניב" → "ביטוח מנהלים ניב — הראל", the second and third record the sibling each created ("… — כלל", "… — מגדל") with its file, and each step names the row its file ended under

#### Scenario: Refused tie leaves the document pending
- **WHEN** the planner ties a registry extract to a contract item and marks the item collected
- **THEN** the `tie_file` step says refused because the papers differ, and the `mark_collected` step says the item stayed pending because its tie was refused

#### Scenario: Claimed instead of collected
- **WHEN** the planner marks a document collected that no received file proves
- **THEN** the `mark_collected` step says the document became claimed and waits for the accountant

#### Scenario: Send time rolled
- **WHEN** the planner sends a text with `send_at` on a Saturday
- **THEN** the `send_whatsapp_text` step shows the requested time, the rolled time and that it was rolled

### Requirement: The conclude step records the decision and what the cycle did with it
The `conclude` step SHALL record the decision and the reasoning, and what the code did with the decision: for `collect`, that the reply is withheld and which documents are being verified against which files; for `follow_up`, that a message was scheduled (the message step follows); for `goal_complete`, that the goal was completed, or that the answer was premature and the cycle failed; for `client_declined`, that the decline routine took over.

#### Scenario: Collect
- **WHEN** the answer concludes `collect` after tying one file
- **THEN** the `conclude` step lists the document and file pair being verified and says the reply is withheld until the verification ends

#### Scenario: Goal complete
- **WHEN** the answer concludes `goal_complete` and every row is settled and the attestation is confirmed
- **THEN** the `conclude` step says the goal was completed, and the `goal.completed` and `send_closing` rows follow as today

### Requirement: A tool-call step is recognisable in the trace
In both trace surfaces (the workspace conversation tab under impersonation and the admin conversation viewer), a step named after a planner tool SHALL show a tool icon, distinct from the shield of checks and security events and the gear of code-only actions. Its label SHALL be the tool's technical name as the call modal shows it. The step modal SHALL render a tool step's parameters and outcome as labelled plain-language rows (document and file names, verdicts, quotes, times, outcomes), with unknown keys still listed generically, as it does for the gate and apply rows today.

#### Scenario: Icons
- **WHEN** an admin views a cycle with `validate_message`, `tie_file`, `conclude` and, later, `send_closing`
- **THEN** `validate_message` shows the shield, `tie_file` and `conclude` the tool icon, `send_closing` the gear

#### Scenario: Step modal of a tie
- **WHEN** the admin opens the `tie_file` step
- **THEN** the modal shows the file name, the document name, the evidence quote when there is one, and the outcome line

### Requirement: Discarded drafts are matched on the message steps
The conversation endpoint SHALL recognise the step that scheduled a draft by the `send_whatsapp_text` and `send_whatsapp_template` steps of this change as well as by the `send_reply` step of older trails, so that a draft a re-plan discarded, its step and its call are flagged as today.

#### Scenario: Discarded draft after this change
- **WHEN** a `send_whatsapp_text` step scheduled a draft and a later re-plan discarded it
- **THEN** the draft shows as a discarded-draft row, its `send_whatsapp_text` step and its `generate_message` call are hidden when the LLM calls toggle is off, as the `send_reply` case is today

### Requirement: Old step names in other specs refer to the tool-call steps
Wherever another capability's spec names an `apply_*` step as the place a planner outcome is recorded (`apply_collections` for split, pair and refusal records in `unlisted-files` and `document-papers`; `apply_stated_costs` for the stated-cost audit row in `code-gates`), that fact SHALL be recorded on the tool-call step of the call it belongs to (`tie_file`, `mark_collected`, `state_cost`, `add_instance`) with the same content, and the requirement is satisfied by that step.

#### Scenario: Stated cost
- **WHEN** the answer states 85000 ILS on the item "הצהרת עלות — מאזדה 3" with a verbatim quote
- **THEN** the `state_cost` step lists that item with its id, its name, 85000, ILS and the quote, which satisfies the `code-gates` requirement that names `apply_stated_costs`
