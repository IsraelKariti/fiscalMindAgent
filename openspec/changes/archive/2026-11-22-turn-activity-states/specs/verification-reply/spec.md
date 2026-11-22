## MODIFIED Requirements

### Requirement: The turn stays visibly in progress
From the start of the collecting cycle until the follow-up cycle has ended, the workspace SHALL show the client as busy, never as idle and never as stuck: the drafting notice during the collecting planner cycle, the processing notice while the collected documents are verified (refreshed per document), and the drafting notice again during the follow-up cycle.

#### Scenario: Accountant opens the client during verification
- **WHEN** the accountant opens the client while verification of a just-collected document is running
- **THEN** the client shows the processing notice and no scheduled message

#### Scenario: Verification ends, follow-up cycle runs
- **WHEN** the last document of the batch is verified and the follow-up planner cycle starts
- **THEN** the processing notice turns into the drafting notice until the reply is scheduled
