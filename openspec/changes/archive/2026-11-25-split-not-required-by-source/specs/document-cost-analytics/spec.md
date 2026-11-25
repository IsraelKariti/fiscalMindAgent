## MODIFIED Requirements

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
The tab SHALL list every filtered client, one row each, with: the client's name (opens the client's workspace), a state marker (completed, running, paused, declined, plus deleted and test badges), documents with a file, items closed from the questionnaire, items closed in the conversation, items marked by hand, items still open, agent messages sent, client messages received, total cost, cost per document with a file, cost per settled item. The default order SHALL be total cost descending; a sort control SHALL also offer cost per document with a file, cost per settled item, documents with a file, items closed from the questionnaire and items closed in the conversation, each descending with undefined values last. A footer row SHALL show the sums of every count and of the total cost, and the pooled averages in the per-item columns.

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
- **WHEN** a client's documents tab shows 9 rows under "לא נדרשים — לפי השאלון", 1 under "לא נדרשים — לפי השיחה", 1 under "לא נדרשים — סומנו ידנית", 1 under "הוצהרו בצ'אט" and 1 under "סופקו כבר — ממתינים לאישורך"
- **THEN** the client's row reads 9 items closed from the questionnaire, 3 items closed in the conversation and 1 item marked by hand
