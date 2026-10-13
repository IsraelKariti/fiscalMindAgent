# Spec Delta

## MODIFIED Requirements

### Requirement: Approve control is visible only to impersonating admins
The workspace timeline SHALL show the "אישור ההודעה" (approve message) control on a review-pending draft only when the viewer is an admin who is impersonating the accountant. An accountant viewing their own workspace SHALL never see the control or any approval modal. The "ממתינה לאישור" (awaiting approval) badge is NOT admin-only: it is shown to every viewer, as the `review-wait-visibility` capability requires.

#### Scenario: Admin in impersonation sees the control
- **WHEN** an admin opens a client's workspace through impersonation and the client's next scheduled message is a draft awaiting review
- **THEN** the timeline shows the awaiting-approval badge and the approve control next to the scheduled message

#### Scenario: Accountant never sees the control
- **WHEN** an accountant (non-admin) opens the same client's workspace while the draft awaits review
- **THEN** the timeline shows the scheduled message with the awaiting-approval badge, without the approve control, and no approval modal can be opened
