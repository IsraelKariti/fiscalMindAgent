# document-cost-analytics Specification

## Purpose
What an admin viewing the workspace as an accountant sees on the agent's documents tab: how much the agent's LLM spend bought in settled checklist items, per client and across the instance, so the product can be priced against the value it brings the accountant; and that nobody else sees it.

## Requirements

### Requirement: The Settings view has an admin-only documents tab
While an admin views the workspace as an accountant, the workspace Settings view SHALL show one more tab labeled "מסמכים" (documents), after the analytics tab and before the dashboard tab, marked admin-only with the same marker and colour as the test and analytics tabs, and laid out at the wide (dashboard) width. The accountant's own session, a staff viewer's session and the monday embed SHALL NOT show the tab, and a remembered tab choice of "documents" SHALL fall back to the general tab when the view is not an admin's view-as session.

#### Scenario: Admin sees the tab
- **WHEN** an admin viewing as an accountant opens the agent's Settings view
- **THEN** the tabs are general, connections, staff, test, analytics, documents, dashboard, and the documents tab carries the admin-only marker

#### Scenario: Accountant does not see the tab
- **WHEN** the accountant or one of their staff opens the Settings view
- **THEN** no documents tab is shown

#### Scenario: Remembered tab outside view-as
- **WHEN** the documents tab was the last open tab and the Settings view is next opened in the accountant's own session
- **THEN** the general tab opens

### Requirement: What counts as a settled item
For each client the tab SHALL count the client's checklist items (catalog-seeded and accountant-added alike), excluding retired items, in five groups:
- **documents with a file**: items whose received file the verification pipeline approved;
- **items closed from the questionnaire**: "not required" items the intake questionnaire settled — the client answered the question or left it empty;
- **items closed in the conversation**: items settled by the client's words in the conversation — the client does not have the asset, the client stated the cost or the vehicle in the chat, or the client says the office already holds the paper (claimed);
- **items marked by hand**: "not required" items the accountant marked by hand, with no client words on the item;
- **items still open**: every other item (not yet asked, awaiting a file, or a file received but not approved).
A retired item SHALL count in no group. An item counts once, by its status and source at load time. **Settled items** are documents with a file + items closed from the questionnaire + items closed in the conversation + items marked by hand.

#### Scenario: Mixed checklist
- **WHEN** a client's checklist holds 4 approved items, 3 "do not have" items settled by the questionnaire, 1 "do not have" item settled in the conversation, 1 stated cost, 1 claimed item, 1 item marked not required by hand, 2 pending items and 1 retired item
- **THEN** the client reads 4 documents with a file, 3 items closed from the questionnaire, 3 items closed in the conversation, 1 item marked by hand and 2 items still open, and 11 settled items

#### Scenario: Accountant-added item approved
- **WHEN** an accountant-added item's file was approved by the pipeline
- **THEN** it counts as a document with a file like a catalog item

#### Scenario: Not-required item without a source
- **WHEN** a "not required" item carries no client quote and no questionnaire note
- **THEN** it counts as marked by hand

### Requirement: A client's document cost
A client's total cost SHALL be the sum of the recorded cost of every LLM call recorded for the client since the client was created (unpriced calls as zero, failed calls and calls of discarded drafts included; nothing recomputed from today's prices). The tab SHALL derive, per client:
- **cost per document with a file** = total cost ÷ documents with a file;
- **cost per settled item** = total cost ÷ settled items (documents with a file + items closed from the questionnaire + items closed in the conversation + items marked by hand);
- **file-reading cost** = the sum of the recorded cost of the client's calls that are tied to a file (classification, extraction, verification, splitting), and **conversation cost** = the rest.
A quotient whose divisor is zero SHALL read as undefined (`—`), never as zero or infinity. Costs SHALL be formatted as the cost tab formats a cost (`$0.0042`, `$0` when zero), with a `+` suffix when any counted call is unpriced.

#### Scenario: Two averages
- **WHEN** a client's calls recorded 1.20 USD in total and the client has 4 documents with a file and 2 items closed in the conversation
- **THEN** the client reads `$0.30` per document with a file and `$0.20` per settled item

#### Scenario: Nothing settled yet
- **WHEN** a client's calls recorded 0.05 USD and no item is settled
- **THEN** the client's total reads `$0.05` and both per-item costs read `—`

#### Scenario: Unpriced call
- **WHEN** one of a client's calls recorded no cost
- **THEN** every cost of that client carries the `+` suffix and the instance totals carry it too

### Requirement: Filters
The tab SHALL offer a client-kind filter with "live clients", "test clients" and "all", default live clients, and a "completed declarations only" toggle, default off. Soft-deleted clients SHALL be included under their kind and marked deleted. Both choices SHALL be remembered in the browser; when the browser's storage is unavailable the tab SHALL use the defaults. Every tile, the list and the footer SHALL follow the filters.

#### Scenario: Default hides test clients
- **WHEN** the instance has 10 live clients and 2 admin test clients
- **THEN** the tab opens on 10 clients and the test clients appear only under "test clients" or "all"

#### Scenario: Completed only
- **WHEN** the admin turns on "completed declarations only" and 3 of the 10 live clients have a complete goal
- **THEN** the tiles, the list and the footer cover those 3 clients

#### Scenario: Deleted client
- **WHEN** a live client was soft-deleted after its calls recorded 0.80 USD
- **THEN** it is listed under "live clients" with a deleted marker and its figures count

### Requirement: Headline tiles
Above the list the tab SHALL show, for the filtered clients, these tiles: clients counted; total cost; documents with a file; items closed from the questionnaire; items closed in the conversation; items marked by hand (with the number of items still open as its note); cost per document with a file (pooled: total cost ÷ total documents with a file); cost per settled item (pooled: total cost ÷ total settled items); the median of the per-client cost per settled item (over clients whose value is defined); cost per completed declaration (the mean total cost of the clients whose goal is complete, with their number); the share of the total cost spent on file-reading calls, as a percentage; agent messages sent per settled item (pooled); and the median days from a completed client's first message to its last message. A tile whose divisor is zero SHALL read `—`.

#### Scenario: Pooled averages
- **WHEN** the filtered clients recorded 6.00 USD in total, with 20 documents with a file, 6 items closed from the questionnaire, 3 items closed in the conversation and 1 item marked by hand
- **THEN** the cost-per-document tile reads `$0.30` and the cost-per-settled-item tile reads `$0.20`

#### Scenario: Three source tiles
- **WHEN** the filtered clients hold 30 items closed from the questionnaire, 12 closed in the conversation, 2 marked by hand and 5 still open
- **THEN** the three tiles read 30, 12 and 2, and the marked-by-hand tile's note says 5 items are still open

#### Scenario: Median differs from the pooled average
- **WHEN** three clients read `$0.10`, `$0.20` and `$1.00` per settled item and a fourth reads `—`
- **THEN** the median tile reads `$0.20`

#### Scenario: Completed declarations
- **WHEN** 3 filtered clients have a complete goal and their totals are 2.00, 3.00 and 4.00 USD
- **THEN** the cost-per-completed-declaration tile reads `$3` with the note "3 declarations"

#### Scenario: No clients
- **WHEN** the filters leave no client
- **THEN** the tab shows the filters and a short empty-state text instead of the tiles and the list

### Requirement: Client list with a footer
The tab SHALL list every filtered client, one row each, with: the client's name (opens the client's workspace), a state marker (completed, running, paused, declined, plus deleted and test badges), documents with a file, items closed from the questionnaire, items closed in the conversation, items marked by hand, items still open, agent messages sent, client messages received, total cost, cost per document with a file, cost per settled item. The default order SHALL be total cost descending; a sort control SHALL also offer cost per document with a file, cost per settled item, documents with a file, items closed from the questionnaire and items closed in the conversation, each descending with undefined values last. A footer row SHALL show the sums of every count and of the total cost, and the pooled averages in the per-item columns. The counts SHALL come from the stored rows, including "not required" rows the client's documents tab does not show.

#### Scenario: Footer averages
- **WHEN** the list holds two clients with totals 1.00 and 3.00 USD, 2 and 6 documents with a file, 1 and 1 items closed from the questionnaire, 1 and 1 items closed in the conversation and 0 and 0 items marked by hand
- **THEN** the footer reads 8 documents with a file, 2 items from the questionnaire, 2 items from the conversation, 0 marked by hand, `$4` total, `$0.50` per document with a file and `$0.3333` per settled item

#### Scenario: Open the client
- **WHEN** the admin clicks a client's name
- **THEN** that client's workspace opens, as from the analytics tab's client list

#### Scenario: Sort by cost per document
- **WHEN** the admin picks "cost per document with a file" in the sort control
- **THEN** the rows order by that column descending and the clients whose value is `—` come last

#### Scenario: Sort by items closed in the conversation
- **WHEN** the admin picks "items closed in the conversation" in the sort control
- **THEN** the rows order by that column descending, ties keeping the total-cost order

#### Scenario: Column split matches the client's tabs
- **WHEN** a client has 9 "not required" rows settled by the questionnaire, 1 "not required" row settled in the conversation, 1 "not required" row marked by hand, 1 row under "הוצהרו בצ'אט" and 1 row under "סופקו ישירות למשרד"
- **THEN** the client's row reads 9 items closed from the questionnaire, 3 items closed in the conversation and 1 item marked by hand

### Requirement: The figures reach an admin only
The figures SHALL be served only by an admin-only route that refuses a non-admin session. No figure of this tab SHALL be present in any reply the accountant's session, a staff viewer's session or the monday embed receives.

#### Scenario: Accountant's session
- **WHEN** the accountant's session requests the instance's document cost
- **THEN** the request is refused and no figure is served
