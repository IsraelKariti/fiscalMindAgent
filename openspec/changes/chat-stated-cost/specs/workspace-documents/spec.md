## MODIFIED Requirements

### Requirement: Every checklist row shows its status
Each row of the capital-declaration documents list SHALL show a status badge that names the row's current status, for every status: unresolved, pending, claimed, collected, approved, stated, not required and retired. The badge SHALL be the only element on the row that uses status wording. A stated row SHALL sit among the settled rows and SHALL show, under the badge, a clickable note quoting the client's words (the `chat-stated-cost` capability).

#### Scenario: Pending row
- **WHEN** a checklist item is pending
- **THEN** its row shows a badge saying the document is awaited from the client

#### Scenario: Unresolved row
- **WHEN** a checklist item is unresolved
- **THEN** its row shows a badge saying the item is still being clarified with the client

#### Scenario: Not-required row
- **WHEN** a checklist item is not required
- **THEN** its row shows a "not required" badge, and no button on the row carries that wording

#### Scenario: Collected row with stalled verification
- **WHEN** a checklist item is collected and its verification stalled or is unavailable
- **THEN** its badge says verification failed, styled as a danger badge

#### Scenario: Stated row
- **WHEN** a vehicle cost declaration was stated in the chat
- **THEN** its row shows a badge saying stated in chat, sits among the settled rows, and a note under it quotes the client's message

### Requirement: Actions offered per status
The actions menu SHALL offer exactly these actions per row status, each with the same effect it has today: unresolved — mark as required, mark as not required, remove; pending — mark as not required, remove; claimed — confirm receipt, remove; collected — approve manually, remove; approved, stated, not required or retired — return to required, remove.

#### Scenario: Pending row menu
- **WHEN** the accountant opens the menu of a pending row
- **THEN** it lists "mark as not required" and "remove", and nothing else

#### Scenario: Unresolved row menu
- **WHEN** the accountant opens the menu of an unresolved row
- **THEN** it lists "mark as required", "mark as not required" and "remove"

#### Scenario: Not-required row menu
- **WHEN** the accountant opens the menu of a not-required row and chooses "return to required"
- **THEN** the row moves to the pending group

#### Scenario: Stated row menu
- **WHEN** the accountant opens the menu of a stated row
- **THEN** it lists "return to required" and "remove", and choosing "return to required" moves the row to the pending group

#### Scenario: Remove
- **WHEN** the accountant chooses "remove" from any row's menu
- **THEN** the checklist item is deleted, as the "×" button did before
