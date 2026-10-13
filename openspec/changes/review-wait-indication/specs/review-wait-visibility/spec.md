# Spec Delta

## Purpose

What the workspace tells every viewer about a scheduled message that waits for admin approval, and how "Send now" and resume behave on such a message, so that nobody sees a message that silently never sends.

## ADDED Requirements

### Requirement: The scheduled message reports its review state
The workspace's client read SHALL say, for the next scheduled message, whether the draft awaits admin approval and whether the worker already held it because its planned time arrived without approval. The answer SHALL come from the same request that returns the scheduled message, so every viewer (the accountant, an admin viewing as the accountant) gets it, without any admin-only request.

#### Scenario: Pending, time ahead
- **WHEN** the instance is in review mode and the draft was marked for review with a planned time one hour ahead
- **THEN** the client read reports the scheduled message as awaiting approval and not yet held

#### Scenario: Pending, time passed
- **WHEN** the planned time arrived and the worker held the draft because the admin had not approved
- **THEN** the client read reports the scheduled message as awaiting approval and held

#### Scenario: Approved or no review mode
- **WHEN** the admin approved the draft, or the instance is not in review mode
- **THEN** the client read reports the scheduled message as not awaiting approval

### Requirement: The timeline shows that the message waits for the admin
When the next scheduled message awaits admin approval, the scheduled bubble SHALL carry an "awaiting admin approval" (ממתינה לאישור מנהל) badge for every viewer, accountant and admin alike. When the worker already held the message, the note under the bubble SHALL say in Hebrew that the planned time passed and the message waits for the admin's approval, instead of showing only a time. The badge SHALL stay while the client is paused.

#### Scenario: Accountant sees a pending draft
- **WHEN** an accountant opens a client whose scheduled message awaits approval and whose planned time is still ahead
- **THEN** the bubble shows the planned time and the awaiting-approval badge, and no approve control

#### Scenario: Accountant sees a held draft
- **WHEN** the planned time passed and the worker held the message
- **THEN** the bubble shows the awaiting-approval badge and the note says the time passed and the message waits for the admin's approval

#### Scenario: Admin sees the same bubble
- **WHEN** an admin viewing as the accountant opens the same client
- **THEN** the bubble shows the same badge and note, plus the approve control as today

#### Scenario: Paused client with a pending draft
- **WHEN** the accountant paused the client while its draft awaited approval
- **THEN** the paused bubble keeps the awaiting-approval badge next to the paused note

### Requirement: "Send now" does not send a message that waits for the admin
When the next scheduled message awaits admin approval (pending or already held), the "Send now" confirmation SHALL state, in Hebrew, that the message waits for the admin's approval and will be sent only after it, and SHALL offer no send action, only close. The send-now request itself SHALL be refused with a clear error naming the reason, and SHALL NOT move the message in the queue or change its planned time. Browser-native dialogs MUST NOT be used.

#### Scenario: Send now on a pending draft
- **WHEN** the accountant clicks "Send now" on a scheduled message that awaits approval
- **THEN** the modal explains that the message waits for the admin's approval and offers only close; nothing is sent and the planned time is unchanged

#### Scenario: Send now on a held draft
- **WHEN** the accountant clicks "Send now" on a message the worker already held
- **THEN** the same modal is shown and nothing changes

#### Scenario: Stale page
- **WHEN** the page was loaded before the draft was marked for review and the accountant confirms "Send now"
- **THEN** the request is refused with an error that says the message waits for the admin's approval, the modal shows that error, and the planned time is unchanged

#### Scenario: Approved draft
- **WHEN** the admin approved the draft and the accountant clicks "Send now"
- **THEN** the regular confirmation is shown and confirming sends the message now, as today
