## MODIFIED Requirements

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
