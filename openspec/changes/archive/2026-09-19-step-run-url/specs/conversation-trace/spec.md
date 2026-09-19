## ADDED Requirements

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

## MODIFIED Requirements

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
