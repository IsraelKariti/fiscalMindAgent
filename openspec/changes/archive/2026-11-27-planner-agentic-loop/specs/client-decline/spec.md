## MODIFIED Requirements

### Requirement: A decline is recognised from the button or from words
The system SHALL treat an inbound WhatsApp message as a decline when the client tapped the intro template's decline button (the quick-reply payload `decline`, or a message whose whole text equals the decline button's text, "העברה ישירות למשרד"), without any planner run. When the client instead writes a refusal in their own words, the planner SHALL recognise it and call the terminal tool `client_declined` with a short reasoning and nothing else: no message, no tie, no checklist change, no fetch action. A `client_declined` call SHALL be refused, with the reason as its result, when the same run already tied a file, changed the checklist, asked the team or scheduled a message; any call after an accepted `client_declined` SHALL be refused. A message that merely asks a question, hesitates, or says "not now" SHALL NOT count as a decline.

#### Scenario: Button tap
- **WHEN** the client taps "העברה ישירות למשרד" on the intro message
- **THEN** the decline is handled at once, and no planner call is recorded for that turn

#### Scenario: Typed refusal
- **WHEN** the client writes "לא, אני אעביר את המסמכים ישירות למשרד"
- **THEN** the planner's run is one turn calling `client_declined`, and the same decline handling follows

#### Scenario: Decline after a tie in the same run
- **WHEN** the model ties a file and then calls `client_declined` in the same run
- **THEN** the decline call is refused with a result saying the run already tied a file, and the model ends the run with a message instead

#### Scenario: Hesitation is not a decline
- **WHEN** the client writes "לא עכשיו, תחזור אליי בשבוע הבא"
- **THEN** the planner does not call `client_declined` and schedules the usual later follow-up
