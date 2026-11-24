## ADDED Requirements

### Requirement: A fetch step shows the session's evidence beside the details
A code step is about a fetch session when its recorded target is a fetch session (today: `tax_fetch.login_started`, `tax_fetch.otp_submitted`, `tax_fetch.failed`). When such a step is opened and the session has stored evidence (openspec `fetch-step-evidence`), the step detail modal SHALL show the session's evidence gallery next to the step details, inside the same modal, in the same two-pane layout as the received-file document pane: details in one pane, the gallery in the other, both scrolling independently, the gallery moving below the details on a narrow screen. Everything the modal shows today SHALL remain in the details pane.

The gallery pane SHALL list the session's steps in order with each step's screenshot, and for each step offer "view HTML", "download HTML", "download snapshot" and "record", with the same safety rules as the admin gallery (HTML only in a sandbox). The evidence SHALL be requested only when the modal opens on that step; loading the trace SHALL NOT request any evidence. While the evidence list loads, the details pane SHALL already be shown and the gallery pane SHALL show a loading note.

A fetch step whose session has no stored evidence SHALL keep the single-column modal and SHALL show a short "no evidence kept" note. The evidence pane SHALL be shown only to an admin (impersonating or not, including from a step link); an accountant viewing the trace SHALL see the single-column modal with no evidence request.

#### Scenario: Failed fetch step beside its screenshots
- **WHEN** an admin opens the `tax_fetch.failed` step of a Menora session whose error says the year list does not offer 2023
- **THEN** the modal shows the error and details on one side and the step screenshots on the other, ending with the failure screenshot, and the admin can open the HTML copy of the filters step without leaving the modal

#### Scenario: Login step of a successful session
- **WHEN** an admin opens the `tax_fetch.login_started` step of a session that later delivered
- **THEN** the gallery shows every step of that session, including the ones recorded after the login

#### Scenario: Session evidence expired
- **WHEN** an admin opens a `tax_fetch.failed` step older than the retention window
- **THEN** the single-column modal opens with the recorded details and a "no evidence kept" note

#### Scenario: Accountant opens a fetch step
- **WHEN** an accountant opens a `tax_fetch.failed` step in the workspace trace
- **THEN** the single-column modal opens and no evidence is requested
