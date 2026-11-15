## Purpose

Which team member handles a declaration-of-capital client: the board column that names the advisor, how that person is matched to the accountant or to an entry of the accountant's staff list at kickoff, and how the advisor is shown on the client's details tab.

## ADDED Requirements

### Requirement: A declaration board may map a tax advisor column
When an accountant adds a declarations board as a client source, the board mapping SHALL offer an optional "tax advisor" field listing only the board's people-typed columns. A column whose title contains `יועץ` SHALL be preselected when one exists. The chosen column SHALL be shown in the board's mapping summary on the Settings page. The field is optional: a board mapped without it behaves as today.

#### Scenario: People column preselected by title
- **WHEN** an accountant adds a declarations board that has a people column titled "יועץ מס"
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
