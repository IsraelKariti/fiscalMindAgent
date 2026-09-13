## Purpose

The admin-only conversation trace: the code-step rows woven into a client's timeline (workspace conversation tab under impersonation, and the admin conversation viewer) and what an admin can open from them.

## ADDED Requirements

### Requirement: Code gate rows open a checks modal
In both trace surfaces, a code-step row whose audit detail carries a `checks` list SHALL be clickable (mouse and keyboard) and SHALL open an in-app modal. Browser-native dialogs (alert, confirm, prompt) MUST NOT be used. The modal SHALL show: the gate's human label and its technical action key, the time of the step, the overall result badge (same wording and colors as the row), and the ordered list of checks. Each check SHALL show its human label (falling back to the technical key when no label exists), a check mark when it passed, and an X when it failed. Beneath every check that carries an observed value, pass or fail, the modal SHALL show that value, and the expected value next to it when the check has one; a failed check SHALL also show its note. When the step carries a general reason (the row's existing `reason`), the modal SHALL show it as well. The modal SHALL close from a close button, the backdrop, and the Escape key. The modal is read-only.

#### Scenario: Failed extraction verification
- **WHEN** an impersonating admin clicks the `verify_extraction` row that shows `result: false`
- **THEN** a modal opens listing every check that ran on that document (for example `legible` ✓, `expected_type` ✓, `as_of_date` ✗), each with the value it inspected (the as-of date read, the amounts found, the subject name), the expected value where there is one, and, under the failed check, the note naming the exact problem (for example "פיקדון -5 ILS is negative")

#### Scenario: Passed gate
- **WHEN** the admin clicks a gate row that shows `result: true`
- **THEN** the modal lists every check with a check mark, its observed (and expected) value, and no notes

#### Scenario: Keyboard
- **WHEN** the admin focuses a gate row with the keyboard and presses Enter or Space
- **THEN** the modal opens; pressing Escape closes it

### Requirement: Rows without a checks list stay as they are
A code-step row whose detail has no `checks` list (audit rows written before checks were recorded, and non-gate steps such as `apply_*` and `send_reply`) SHALL render exactly as today and SHALL NOT be clickable.

#### Scenario: Old audit row
- **WHEN** the trace shows a gate row recorded before this change, whose detail has `result` but no `checks`
- **THEN** the row shows the result badge and reason as before, with no click affordance and no modal

### Requirement: Visibility unchanged
The checks modal SHALL be available only where the trace itself is available today: to an admin viewing the trace (impersonation in the workspace, or the admin viewer). An accountant's session SHALL never receive check lists or see the modal.

#### Scenario: Accountant
- **WHEN** an accountant opens their own client's conversation tab
- **THEN** no trace rows, and therefore no gate modal, are shown
