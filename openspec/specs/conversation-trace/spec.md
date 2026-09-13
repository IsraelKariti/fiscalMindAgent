# conversation-trace Specification

## Purpose

The admin-only conversation trace: the code-step rows woven into a client's timeline (workspace conversation tab under impersonation, and the admin conversation viewer) and what an admin can open from them.

## Requirements

### Requirement: Code gate rows open a checks modal
In both trace surfaces, every code-step row SHALL be clickable (mouse and keyboard) and SHALL open an in-app modal. Browser-native dialogs (alert, confirm, prompt) MUST NOT be used. The modal SHALL show: the step's human label and its technical action key, the time of the step, the overall result badge when the row has one (same wording and colors as the row), and the general reason when the step carries one (the row's existing `reason`).

Beneath that, the modal SHALL show a "what this step did" section: the step's recorded detail rendered as labelled plain-language rows, never only as raw JSON. Document rows SHALL be shown by document name (the recorded name, or the id when the row was written before names were recorded), instance additions by the anchor document and the instance names, retirements and resolutions by document name plus the evidence quote, collections by the names marked collected and claimed and the file-to-document pairs, message steps by channel, message kind and scheduled time, and review steps by channel and scheduled time. Fields the renderer does not know SHALL still be listed generically (key and value) so nothing recorded is hidden. The client's own name, which every row repeats, is omitted. Text values SHALL render in their own writing direction.

When the step's detail carries a `checks` list, the modal SHALL additionally show the ordered list of checks. Each check SHALL show its human label (falling back to the technical key when no label exists), a check mark when it passed, and an X when it failed. Beneath every check that carries an observed value, pass or fail, the modal SHALL show that value, and the expected value next to it when the check has one; a failed check SHALL also show its note.

The raw detail JSON SHALL remain available in a collapsed section. The modal SHALL close from a close button, the backdrop, and the Escape key. The modal is read-only.

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

### Requirement: Visibility unchanged
The checks modal SHALL be available only where the trace itself is available today: to an admin viewing the trace (impersonation in the workspace, or the admin viewer). An accountant's session SHALL never receive check lists or see the modal.

#### Scenario: Accountant
- **WHEN** an accountant opens their own client's conversation tab
- **THEN** no trace rows, and therefore no gate modal, are shown

### Requirement: Apply steps record what they changed by name
The planner's apply steps SHALL record, in their audit detail, a human-readable name for every document they touched, alongside the id: `apply_resolutions` (document name and verdict per row), `apply_additions` (anchor document name per entry, with the instance names already recorded), `apply_retirements` (document name and evidence quote per row), `apply_collections` (names for the proposed, collected and claimed documents, and the file name and document name for each pair), and the `document.collected` row (document names). Rows written before this change are not rewritten.

#### Scenario: Retirement recorded with its name
- **WHEN** the planner retires the document "אישור יתרות — בנק הפועלים" with an evidence quote
- **THEN** the `apply_retirements` audit row lists that document with its id, its name and the quote

#### Scenario: Collection recorded with names
- **WHEN** the planner marks two documents collected and links one received file to one of them
- **THEN** the `apply_collections` row lists the two document names under collected, and the pair shows the file name with the document name
