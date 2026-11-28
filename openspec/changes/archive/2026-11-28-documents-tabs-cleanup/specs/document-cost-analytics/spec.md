## MODIFIED Requirements

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
