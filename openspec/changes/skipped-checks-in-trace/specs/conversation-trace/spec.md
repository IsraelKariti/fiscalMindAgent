## MODIFIED Requirements

### Requirement: Code gate rows open a checks modal
In both trace surfaces, every code-step row SHALL be clickable (mouse and keyboard) and SHALL open an in-app modal. Browser-native dialogs (alert, confirm, prompt) MUST NOT be used. The modal SHALL show: the step's human label and its technical action key, the time of the step, the overall result badge when the row has one (same wording and colors as the row), and the general reason when the step carries one (the row's existing `reason`).

Beneath that, the modal SHALL show a "what this step did" section: the step's recorded detail rendered as labelled plain-language rows, never only as raw JSON. Document rows SHALL be shown by document name (the recorded name, or the id when the row was written before names were recorded), instance additions by the anchor document and the instance names, retirements and resolutions by document name plus the evidence quote, collections by the names marked collected and claimed and the file-to-document pairs, message steps by channel, message kind and scheduled time, and review steps by channel and scheduled time. Fields the renderer does not know SHALL still be listed generically (key and value) so nothing recorded is hidden. The client's own name, which every row repeats, is omitted. Text values SHALL render in their own writing direction.

When the step's detail carries a `checks` list, the modal SHALL additionally show the ordered list of checks. Each check SHALL show its human label (falling back to the technical key when no label exists), a check mark when it passed, an X when it failed, and a neutral glyph (a dash) when it was skipped (`passed: null`). A skipped check SHALL show the word "לא נבדק" in place of the pass/fail wording and, beneath it, the skip reason recorded in its note, in a muted style that is clearly not a failure. Beneath every check that carries an observed value, pass or fail, the modal SHALL show that value, and the expected value next to it when the check has one; a failed check SHALL also show its note. The section heading SHALL state how many checks ran and how many were skipped when at least one was skipped (for example "6 נבדקו · 5 לא נבדקו"). A row recorded before skipped entries existed (no `passed: null` entry) SHALL render exactly as before.

The raw detail JSON SHALL remain available in a collapsed section. The modal SHALL close from the backdrop and the Escape key; it SHALL NOT have a close button. The copy buttons (see the copy requirements) SHALL sit at the top of the modal, beside the title, never at the bottom. On open, keyboard focus SHALL move into the modal so Escape and Tab work at once. The modal is read-only.

#### Scenario: Failed extraction verification
- **WHEN** an impersonating admin clicks the `verify_extraction` row that shows `result: false`
- **THEN** a modal opens listing every check of the document type in order (for example `legible` ✓, `expected_type` ✓, `as_of_date` ✗), each ran check with the value it inspected (the as-of date read, the amounts found, the subject name), the expected value where there is one, and, under the failed check, the note naming the exact problem (for example "פיקדון -5 ILS is negative")

#### Scenario: Skipped checks in an extraction verification
- **WHEN** the admin clicks a `verify_extraction` row for a bank balance document whose owner prints no id number
- **THEN** the modal lists eleven checks; `id_checksum`, `id_matches_client`, `client_id_on_file`, `spouse_adopted` and `co_owners` show a dash glyph, the word "לא נבדק" and a muted reason such as "במסמך לא מודפס מספר תעודת זהות של בעלים"; the section heading says six checks ran and five were skipped; the result badge reflects only the six that ran

#### Scenario: Passed gate
- **WHEN** the admin clicks a gate row that shows `result: true`
- **THEN** the modal lists every ran check with a check mark, its observed (and expected) value, and no failure notes; skipped checks, if any, show the dash glyph and their skip reason

#### Scenario: Old row without skipped entries
- **WHEN** the admin clicks a `verify_extraction` row recorded before skipped checks were kept
- **THEN** the modal lists only the checks the row carries, with check marks and X marks as before, and no skipped count in the heading

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
