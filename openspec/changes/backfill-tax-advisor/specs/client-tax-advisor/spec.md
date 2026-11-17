## ADDED Requirements

### Requirement: An admin can re-read the advisor of every remembered row
While an admin views the workspace as the accountant, the system SHALL offer a "re-read tax advisors" action for the agent. The accountant's own session and a staff viewer SHALL NOT see the action, and the request behind it SHALL be refused as admin-only for anyone who is not an admin viewing as the accountant. Running the action SHALL go over every live client of the agent that remembers its monday board and item (test clients and deleted clients excluded) and, for each one, read the remembered row from monday with the accountant's monday connection and resolve the advisor exactly as the kickoff does: a person in the mapped cell is matched and stored, an empty cell clears the stored advisor, and a board without the advisor mapping leaves the stored advisor untouched. A client whose remembered board is no longer a configured source, or whose row cannot be fetched, SHALL be skipped without stopping the run. The run SHALL NOT change anything else on the client, SHALL NOT start, resume or message any client, and SHALL NOT write to monday. When the run ends, the action SHALL show how many clients were updated, cleared, left unchanged, skipped, and failed. Each client whose stored advisor changed SHALL be recorded as a `client.tax_advisor_backfilled` audit event with the real admin as the actor, naming the previous and the new advisor and match. An accountant without a monday connection SHALL make the run refuse with a reason before any client is touched.

#### Scenario: Clients enrolled before the mapping
- **WHEN** an admin viewing as the accountant runs the action on an agent whose board now maps the advisor column, and three clients remember rows whose cell names a staff member, the accountant, and nobody
- **THEN** the first two clients get their advisor stored with the matching result, the third stays without an advisor, and the result shows two updated and one unchanged

#### Scenario: Advisor already stored and unchanged
- **WHEN** the action runs on a client whose stored advisor is the same person with the same match as the row's cell
- **THEN** the client is counted as unchanged and no audit event is written for it

#### Scenario: Cell emptied since the kickoff
- **WHEN** the action runs on a client with a stored advisor whose row's cell is now empty
- **THEN** the stored advisor is removed, the client is counted as cleared, and an audit event names the previous advisor

#### Scenario: Board without the mapping
- **WHEN** the action runs on a client whose remembered board maps no advisor column
- **THEN** the client's stored advisor is left as it is and the client is counted as skipped

#### Scenario: Row no longer on monday
- **WHEN** the action runs on a client whose remembered item was deleted on monday
- **THEN** that client is counted as failed, the run continues with the next client, and the result still reports every count

#### Scenario: Accountant's own session
- **WHEN** the accountant opens the Settings view in their own session, or sends the request behind the action directly
- **THEN** no action is shown and the request is refused as admin-only

#### Scenario: No monday connection
- **WHEN** an admin runs the action for an accountant who has not connected monday
- **THEN** the run refuses with "the accountant has no monday connection" and no client is changed
