## MODIFIED Requirements

### Requirement: A decline is recognised from the button or from words
The system SHALL treat an inbound WhatsApp message as a decline when the client tapped the intro template's decline button (the quick-reply payload `decline`, or a message whose whole text equals the decline button's text, "העברה ישירות למשרד"), without any planner run. When the client instead writes a refusal in their own words (for example "לא תודה", "אני מעדיף להביא את המסמכים למשרד"), the planner SHALL recognise it and answer with the `client_declined` decision and nothing else: no reminder, no explanation, no attempt to persuade. A message that merely asks a question, hesitates, or says "not now" SHALL NOT count as a decline.

#### Scenario: Button tap
- **WHEN** the client taps "העברה ישירות למשרד" on the intro message
- **THEN** the decline is handled at once, and no planner call is recorded for that turn

#### Scenario: Typed refusal
- **WHEN** the client writes "לא, אני אעביר את המסמכים ישירות למשרד"
- **THEN** the planner answers `client_declined`, and the same decline handling follows

#### Scenario: Hesitation is not a decline
- **WHEN** the client writes "לא עכשיו, תחזור אליי בשבוע הבא"
- **THEN** the planner does not answer `client_declined` and schedules the usual later follow-up
