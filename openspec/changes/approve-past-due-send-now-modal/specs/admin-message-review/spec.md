## Purpose

Admin-only review and approval of agent drafts that are held for human review before they go to a client, including who may see the approve control in the workspace timeline and what the admin is told before a past-due approval sends immediately.

## ADDED Requirements

### Requirement: Approve control is visible only to impersonating admins
The workspace timeline SHALL show the "אישור ההודעה" (approve message) control on a review-pending draft only when the viewer is an admin who is impersonating the accountant. An accountant viewing their own workspace SHALL never see the control, the "ממתינה לאישור" (awaiting approval) badge, or any approval modal.

#### Scenario: Admin in impersonation sees the control
- **WHEN** an admin opens a client's workspace through impersonation and the client's next scheduled message is a draft awaiting review
- **THEN** the timeline shows the awaiting-approval badge and the approve control next to the scheduled message

#### Scenario: Accountant never sees the control
- **WHEN** an accountant (non-admin) opens the same client's workspace while the draft awaits review
- **THEN** the timeline shows the scheduled message without the awaiting-approval badge, without the approve control, and no approval modal can be opened

### Requirement: Past-due approval shows a send-immediately warning before confirming
When the admin clicks the approve control and the draft is past due, the system SHALL open an in-app warning modal that states, in Hebrew, that the planned send time has passed and the message will be sent immediately on approval. The modal SHALL offer confirm and cancel. The message SHALL be approved only after the admin confirms. Browser-native dialogs (alert, confirm, prompt) MUST NOT be used.

A draft is past due when either the worker has already parked it because its send time arrived while it awaited review, or the planned send time is not later than the viewer's current time. The check SHALL be made at click time.

#### Scenario: Send time passed while the page was open
- **WHEN** the timeline was loaded before the planned send time, the time then passes, and the admin clicks approve
- **THEN** the warning modal opens and says the message will be sent immediately

#### Scenario: Draft already parked by the worker
- **WHEN** the worker has parked the draft because its send time arrived unapproved, and the admin clicks approve
- **THEN** the warning modal opens and says the message will be sent immediately

#### Scenario: Admin cancels
- **WHEN** the warning modal is open and the admin cancels or clicks outside it
- **THEN** the modal closes and the draft stays awaiting review, unchanged

#### Scenario: Admin confirms
- **WHEN** the warning modal is open and the admin confirms
- **THEN** the draft is approved, the message is sent immediately, and the timeline shows brief feedback that the message was sent immediately

### Requirement: On-time approval confirms with the planned send time
When the admin clicks the approve control and the draft is not past due, the system SHALL open the regular (non-warning) confirm modal that names the planned send time, and approval SHALL keep the planned send time.

#### Scenario: Approve before the send time
- **WHEN** the planned send time is still in the future and the admin clicks approve
- **THEN** the confirm modal shows the planned send time, and after confirming the draft stays scheduled for that time
