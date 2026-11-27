# client-tax-advisor Specification

## Purpose
Which team member handles a declaration-of-capital client: the board column that names the advisor, how that person is matched to the accountant or to an entry of the accountant's staff list at kickoff, and how the advisor is shown on the client's details tab.

## Requirements

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

### Requirement: A declaration board may map a tax advisor column
When an accountant adds a declarations board as a client source, the board mapping SHALL offer an optional "tax advisor" field listing only the board's people-typed columns. A column whose title contains `יועצת` or `יועץ` SHALL be preselected when one exists. The chosen column SHALL be shown in the board's mapping summary on the Settings page. The field is optional: a board mapped without it behaves as today.

#### Scenario: People column preselected by title
- **WHEN** an accountant adds a declarations board that has a people column titled "יועצת מס"
- **THEN** the mapping modal shows a tax advisor field with that column preselected, and after confirming, the board's summary names the column

#### Scenario: Board without a people column
- **WHEN** an accountant adds a declarations board that has no people-typed column
- **THEN** the tax advisor field offers only "none" and the board can be confirmed without it

### Requirement: The kickoff resolves the advisor to a team member
At every kickoff of a declaration row (the first enrollment and every re-fired kickoff), when the board maps a tax advisor column, the system SHALL read the row's cell, take the first person in it, and look up that person's monday display name and email address. The advisor SHALL be stored on the client as the name, the email (when known) and the match: the accountant, when the email equals the accountant's sign-in email ignoring letter case; a staff entry, when the email equals an address on that accountant's staff list ignoring letter case; otherwise unmatched. A person whose email cannot be read (the accountant's monday connection lacks the users permission, or the lookup fails) SHALL be stored by display name as unmatched, with a warning logged naming the reason. An empty cell SHALL clear any advisor stored earlier. A board without the mapping SHALL leave the stored advisor untouched. None of these outcomes SHALL stop the kickoff. The kickoff's audit detail SHALL name the advisor and the match when one was read.

#### Scenario: Advisor is a staff member
- **WHEN** the row's advisor cell holds a monday user whose email is on the accountant's staff list in a different letter case
- **THEN** the client's advisor is stored with that name and email, matched to that staff entry, and the kickoff audit names the advisor

#### Scenario: Advisor is the accountant
- **WHEN** the row's advisor cell holds the accountant's own monday user
- **THEN** the client's advisor is stored matched to the accountant

#### Scenario: Advisor on no list
- **WHEN** the row's advisor cell holds a monday user whose email is neither the accountant's nor on the staff list
- **THEN** the client's advisor is stored with the name and email as unmatched, and the kickoff proceeds

#### Scenario: Connection without the users permission
- **WHEN** the accountant connected monday before the users permission was requested and a row with an advisor is kicked off
- **THEN** the advisor is stored by display name as unmatched, a warning says the monday connection needs reconnecting, and the conversation starts as usual

#### Scenario: Re-fired kickoff after a change on the board
- **WHEN** a client already enrolled is kicked off again and the row's advisor cell now holds another person
- **THEN** the stored advisor is replaced by the new person

#### Scenario: Cell emptied
- **WHEN** a client with a stored advisor is kicked off again and the row's advisor cell is empty
- **THEN** the stored advisor is removed

### Requirement: The details tab shows the advisor
The client's details tab SHALL show the stored advisor as a chip among the client's meta chips, labelled "tax advisor" with the advisor's name; hovering SHALL show the email when known. An unmatched advisor SHALL be marked "not on the staff list" in the chip. A client with no stored advisor SHALL show no advisor chip. The chip SHALL be shown alike to the accountant, to a staff viewer and to an admin viewing as the accountant, and SHALL NOT be editable in the workspace.

#### Scenario: Matched advisor
- **WHEN** a client whose advisor is a staff member is opened on the details tab
- **THEN** a chip shows the advisor's name, and its tooltip shows the email

#### Scenario: Unmatched advisor
- **WHEN** a client whose advisor matched nobody is opened on the details tab
- **THEN** the chip shows the name and says the person is not on the staff list

#### Scenario: No advisor
- **WHEN** a client enrolled from a board without the mapping is opened on the details tab
- **THEN** no advisor chip is shown

#### Scenario: Staff viewer
- **WHEN** a staff viewer opens the details tab of a client with an advisor
- **THEN** the same chip is shown and there is no control to change it

### Requirement: The monday connection asks for the users permission
The monday OAuth connection SHALL request permission to read the account's users in addition to the board permissions requested today, so the people cell can be resolved to an email.

#### Scenario: New connection
- **WHEN** an accountant connects monday after this change
- **THEN** the consent screen lists reading users, and a later kickoff resolves the advisor's email

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
