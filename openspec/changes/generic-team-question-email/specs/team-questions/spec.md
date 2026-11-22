## MODIFIED Requirements

### Requirement: The question is addressed to the client's team member
A question SHALL be addressed to the client's stored tax advisor when that advisor is matched to the accountant or to a staff entry; when the client has no stored advisor, or the advisor is unmatched, the question SHALL be addressed to the accountant. The record SHALL keep the addressee's name and email address, the time asked, and the question and reason text. The addressee SHALL receive one generic email: it SHALL name the client, say that the agent has a question it cannot answer itself, say that the question and the answer box are in the questions tab of the client's page in the app, say that a reply to the email is not read, and carry a link to the app. The email SHALL NOT carry the question text or the agent's reason. It SHALL be sent from the platform's no-reply address and recorded on the client's trace with the kind `team_question`, the recipient, the subject, the body and the provider id, or a warning step with the error when the send fails. A failed email SHALL NOT fail the planning cycle and SHALL NOT remove the question: the question stays open and answerable in the app.

#### Scenario: Advisor is a staff member
- **WHEN** the client's advisor is matched to a staff entry and the planner asks the team
- **THEN** the question is addressed to that staff member's email and name, and the email goes to that address

#### Scenario: Advisor unmatched
- **WHEN** the client's advisor is stored as "not on the staff list"
- **THEN** the question is addressed to the accountant and the email goes to the accountant's sign-in address

#### Scenario: No advisor
- **WHEN** the client was enrolled from a board without an advisor column
- **THEN** the question is addressed to the accountant

#### Scenario: Email carries no question text
- **WHEN** the planner asks the team "does the office hold the previous declaration?" with the reason "the client asks"
- **THEN** the email names the client in the subject and body, points to the questions tab and the app link, says a reply to the email is not read, and contains neither the question nor the reason

#### Scenario: Email fails
- **WHEN** the mail provider rejects the send
- **THEN** the trace holds a warning step with the error, the question is open in the app, and the client's holding message is still sent
