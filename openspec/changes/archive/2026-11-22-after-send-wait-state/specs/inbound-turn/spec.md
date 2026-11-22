## ADDED Requirements

### Requirement: The workspace shows the after-send wait
While a client's planner run is waiting out the after-send delay (the agent's message was delivered, the client has not replied, and the deferred run has not started), the workspace SHALL NOT show the client as drafting: the conversation timeline SHALL end at the delivered message, with no drafting placeholder, no waiting sentence, no "stuck" notice, no error wording and no retry control, however long the wait is. The client read of the workspace API SHALL carry the time the deferred run is due, so every viewer of the client (accountant, staff viewer, admin viewing as) sees the same silent state. When the wait ends and the planner starts, the workspace SHALL show the drafting state as today; when the client replies inside the wait, the workspace SHALL show the turn as in progress as today.

#### Scenario: Accountant opens the client during the wait
- **WHEN** the agent's message was delivered at 19:01 with a one-hour delay and the accountant opens the client at 19:10
- **THEN** the timeline ends at the 19:01 message: no drafting placeholder, no waiting sentence, no "stuck" notice and no Retry button

#### Scenario: The wait passes
- **WHEN** the page is open when 20:01 arrives and the planner run starts
- **THEN** the page refreshes by itself and shows the drafting placeholder until the next message is scheduled

#### Scenario: Client replies during the wait
- **WHEN** the client replies at 19:30
- **THEN** the timeline shows the reply and the drafting state of the inbound turn

#### Scenario: The queued run is lost
- **WHEN** the queue lost the deferred run (queue data loss) and the worker has not yet recovered it
- **THEN** the client read carries no due time and the workspace falls back to today's behaviour (drafting placeholder, then the stuck notice with Retry)
