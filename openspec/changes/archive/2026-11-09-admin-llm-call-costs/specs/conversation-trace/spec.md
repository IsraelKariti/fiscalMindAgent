## ADDED Requirements

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
