## ADDED Requirements

### Requirement: A client without a tax advisor is not started
The monday kickoff SHALL NOT draft a client's first message unless the row resolves to a tax advisor with an email address. A board that maps no advisor column, an advisor cell that is empty, and an advisor whose email could not be read SHALL each refuse the start. The client SHALL still be enrolled (when new) and SHALL remember its board row, so a later click can start it. The refusal SHALL be recorded as a `client.kickoff_refused` audit event naming the reason, and the client SHALL carry a blocked-kickoff marker that the workspace header shows as "no tax advisor on the board row" to the accountant, a staff viewer and an admin viewing as the accountant. A later kickoff that resolves an advisor with an email SHALL clear the marker and start the client as usual. The kickoff webhook SHALL still answer success to monday (the refusal is not an error monday should retry). Admin test clients are not created through the kickoff and SHALL NOT be affected.

#### Scenario: Empty advisor cell
- **WHEN** the accountant clicks the kickoff on a row whose advisor cell is empty
- **THEN** the client is enrolled but no first message is drafted, the trace shows the refusal with the reason "advisor cell empty", and the client header shows the blocked-kickoff badge

#### Scenario: Board without the advisor mapping
- **WHEN** the kickoff fires on a board that maps no advisor column
- **THEN** no first message is drafted and the refusal names the missing mapping

#### Scenario: Advisor without an email
- **WHEN** the row names an advisor but the monday connection cannot read users' emails
- **THEN** no first message is drafted and the refusal says the advisor's email could not be read

#### Scenario: Cell filled and clicked again
- **WHEN** the accountant fills the advisor cell with a person who has an email and clicks the kickoff again
- **THEN** the blocked-kickoff badge disappears and the first message is drafted as for any kickoff

#### Scenario: Advisor present
- **WHEN** the row names an advisor with an email, matched or not to the staff list
- **THEN** the kickoff proceeds exactly as today
