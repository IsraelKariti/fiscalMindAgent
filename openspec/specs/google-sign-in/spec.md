# google-sign-in Specification

## Purpose

How a Google sign-in is matched to a FiscalMind user account: the email address is the identity, the Google account ID is kept only as information, and a row prepared before the first sign-in (admin invite or monday) becomes that person's account on their first Google sign-in.

## Requirements

### Requirement: A Google sign-in is matched to the user by email
When a person signs in with Google, the system SHALL look for the user whose email equals the address Google verified, compared case-insensitively, and SHALL sign that user in, updating the stored name, picture and Google account ID from the Google answer. When no user has that email, the system SHALL create a new user with it. The Google account ID SHALL never be used to find a user. There SHALL be at most one user per email address.

#### Scenario: Returning user
- **WHEN** a person whose email already has a user row signs in with Google
- **THEN** they are signed in as that user and no second row is created

#### Scenario: New user
- **WHEN** a person signs in with Google and no user row has their email
- **THEN** a new user row with that email is created and they are signed in as it

#### Scenario: Different casing
- **WHEN** Google reports `Michal@Example.com` and the stored row holds `michal@example.com`
- **THEN** the sign-in matches that row

#### Scenario: Email changed on the Google side
- **WHEN** a person whose Google account was renamed to a new address signs in, and the old address still has a user row
- **THEN** a new user is created for the new address; the sign-in does not fail because the same Google account ID is already stored on the old row

### Requirement: Rows prepared before the first sign-in are taken over
A user row created by an admin invite (no Google account ID yet) or by opening FiscalMind inside monday (a placeholder ID that starts with `monday:`) SHALL become the person's account on their first Google sign-in with that email: the same row is signed in and receives the real Google account ID, so everything attached to the row (agents, mailbox, staff list membership, monday link) stays theirs.

#### Scenario: Invited by an admin
- **WHEN** an admin activated an email before that person ever signed in, and the person then signs in with Google
- **THEN** they are signed in as the invited row with its agents already configured

#### Scenario: Provisioned by monday
- **WHEN** a person first opened FiscalMind inside monday, which created a row with a placeholder ID, and later signs in with Google using the same email
- **THEN** they are signed in as that same row, the placeholder ID is replaced by the real Google account ID, and the sign-in does not fail

#### Scenario: Staff member provisioned by monday
- **WHEN** an accountant added an employee's email to the staff list and that employee's row was earlier created by monday
- **THEN** the employee's Google sign-in opens the accountant's workspace as a read-only viewer

### Requirement: "Signed in yet" means a real Google sign-in
Wherever the system shows whether a person has signed in yet (an accountant's staff list, the admin whitelist, the admin accountants list), it SHALL show "signed in" only after a Google sign-in. A row that exists only because of an admin invite or monday provisioning SHALL show as not signed in yet.

#### Scenario: monday row before Google sign-in
- **WHEN** an employee's row was created by monday and they have not signed in with Google
- **THEN** the accountant's staff list shows them as not signed in yet

#### Scenario: After the first Google sign-in
- **WHEN** that employee signs in with Google
- **THEN** the staff list shows them as signed in
