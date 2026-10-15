## ADDED Requirements

### Requirement: Twilio number name records the owning agent
A number the platform owns on Twilio SHALL carry, in its Twilio friendly name, the agent instance that currently uses it: the platform SHALL set the name to `fiscalmind <agent type> <agent instance id>` when it buys the number for an instance and when an admin assigns the number to an instance, and SHALL set it to `fiscalmind pool` when the number is unassigned (explicitly, or because the accountant account was deleted). The rename on assignment SHALL be best-effort: a rename failure is logged and does not undo or fail the assignment. A number the account does not own (an externally registered number entered by hand) is never renamed.

#### Scenario: Assign a pool number
- **WHEN** an admin assigns an owned number named `fiscalmind pool` to an agent instance
- **THEN** after the assignment the number's Twilio friendly name is `fiscalmind <agent type> <instance id>` of that instance

#### Scenario: Re-assign within the same environment
- **WHEN** an admin assigns a number that another agent instance of this environment used until now
- **THEN** the assignment follows the existing rules and the name is updated to the new instance's label

#### Scenario: Rename fails
- **WHEN** Twilio rejects the rename after the assignment
- **THEN** the assignment is kept, the failure is logged, and the response reports the assignment as successful

#### Scenario: Externally registered number
- **WHEN** an admin assigns a number the Twilio account does not own
- **THEN** no rename is attempted and the assignment follows the existing rules

### Requirement: Numbers owned by another environment are not offered
When a number owned on Twilio is not assigned in this environment but its friendly name records an agent instance id that does not exist in this environment's database, the number SHALL be treated as in use by another environment: the pool / orphaned-numbers list SHALL report it with that flag, the admin UI SHALL show it greyed out with the note "in use in another environment" and without a choose or release button, and the platform SHALL refuse to assign it to an agent instance or to release it, returning a conflict error that says the number is in use in another environment. A number whose name records an instance id that exists in this environment, or whose name follows no ownership convention, SHALL be offered as free, as today.

#### Scenario: Production number seen from local development
- **WHEN** an admin in local development opens the pool and a number is named `fiscalmind declaration_of_capital <id>` where `<id>` is not an agent instance in the local database
- **THEN** the number is listed greyed out with the note "in use in another environment" and cannot be chosen

#### Scenario: Manual assignment of a number owned elsewhere
- **WHEN** an admin types that number into the manual assignment form
- **THEN** the assignment is refused with a conflict error that names the cause, and the number's webhook and name are not changed

#### Scenario: Release of a number owned elsewhere
- **WHEN** an admin asks to release that number from the orphaned-numbers section
- **THEN** the release is refused with a conflict error and the number stays on the account

#### Scenario: Stale label from this environment
- **WHEN** an owned, unassigned number is named with an instance id that exists in this environment's database
- **THEN** the number is offered as free and may be chosen or released

#### Scenario: Number without an ownership label
- **WHEN** an owned, unassigned number's friendly name is its phone number or any text outside the `fiscalmind …` convention
- **THEN** the number is offered as free, as today
