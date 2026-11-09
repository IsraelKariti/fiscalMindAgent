# admin-roster-cost Specification

## Purpose
What an admin viewing the workspace as an accountant sees about each client's accumulated LLM cost in the sidebar client list, and that no other viewer sees it.

## Requirements

### Requirement: Each client row shows the client's accumulated LLM cost to the admin
While an admin views the workspace as an accountant (view-as), every row of the sidebar client list SHALL show, beside the client's name, a small pill with the client's accumulated LLM cost in USD: the sum of the recorded cost of every LLM call made for that client since the client was created, counting a call that recorded no cost as zero. The amount SHALL be formatted as the admin call browser and the trace cost pills format a cost (`$0.0042`, `<$0.0001`, `$1.25`), except that a client whose sum is zero SHALL read `$0`. The pill's hover text SHALL say it is the client's total LLM cost and that only an admin sees it. The pill SHALL be a label only: clicking it does nothing beyond what clicking the row does, and the row keeps opening the client as today. The deleted-clients list SHALL show the pill the same way. The amount SHALL be the one computed when the list was last loaded; it refreshes whenever the list reloads (roster change, deleted-list toggle, page load), not on every new call.

#### Scenario: Client with spend
- **WHEN** an admin views as an accountant and a client's calls recorded 0.0042 and 0.0100 USD
- **THEN** that client's row shows the name and, beside it, a pill reading `$0.0142`

#### Scenario: Client with no calls
- **WHEN** a client has no LLM calls yet
- **THEN** its row shows a pill reading `$0`

#### Scenario: Unpriced calls count as zero
- **WHEN** a client's only calls ran on models the pricing registry did not know
- **THEN** its row shows a pill reading `$0`

#### Scenario: Deleted client
- **WHEN** the admin turns on the deleted-clients list and a deleted client's calls recorded 1.25 USD in total
- **THEN** that deleted client's row shows a pill reading `$1.25`

#### Scenario: Test client
- **WHEN** an admin test client appears in the view-as list with 0.30 USD of calls
- **THEN** its row shows the test badge as today and a pill reading `$0.30`

#### Scenario: Pill is not a control
- **WHEN** the admin clicks the pill
- **THEN** the client opens exactly as when clicking the name, and nothing else happens

### Requirement: The cost never reaches a non-admin viewer
The workspace client-list reply SHALL include a per-client cost only for an admin's view-as session. The accountant's own session, a staff member's session of the accountant and the monday embed SHALL receive the client list without any cost field, and their sidebar SHALL show no pill and no cost anywhere in the row.

#### Scenario: Accountant's own session
- **WHEN** the accountant loads their client list
- **THEN** no row carries a cost field in the reply and no row shows a cost pill

#### Scenario: Staff viewer
- **WHEN** a staff member of the accountant loads the client list
- **THEN** no row carries a cost field in the reply and no row shows a cost pill

#### Scenario: Admin view-as
- **WHEN** an admin viewing as the accountant loads the client list
- **THEN** every row carries a cost field and shows the pill
