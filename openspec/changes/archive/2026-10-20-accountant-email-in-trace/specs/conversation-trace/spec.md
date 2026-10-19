## ADDED Requirements

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
