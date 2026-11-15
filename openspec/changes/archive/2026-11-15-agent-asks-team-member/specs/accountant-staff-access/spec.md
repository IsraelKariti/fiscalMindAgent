## MODIFIED Requirements

### Requirement: A viewer may drive a client's conversation
A signed-in staff viewer SHALL be able to take the conversation-flow actions on any client of the accountant's workspace that the accountant could take, on every sign-in surface: pause the agent's outreach, resume it (including the resume that releases the held first message and so starts the conversation), send the waiting message now, retry a failed send, retry or regenerate a draft, and close a question the agent asked the team, by an answer or as answered directly (openspec `team-questions`). Each such request under a viewer's session SHALL be handled exactly as under the accountant's session, with the same confirmations, warnings and results. The workspace SHALL show the viewer those controls wherever the accountant sees them.

#### Scenario: Starting a conversation
- **WHEN** a viewer opens a client whose first message is held and chooses resume
- **THEN** the same confirmation the accountant would see appears, and on confirming, the held first message is released as it would be for the accountant

#### Scenario: Pausing
- **WHEN** a viewer chooses pause on a client with a scheduled message
- **THEN** the client is paused and the scheduled message is held, exactly as for the accountant

#### Scenario: Resuming
- **WHEN** a viewer chooses resume on a paused client
- **THEN** the client resumes exactly as for the accountant, including the late-send warning when the planned time has passed

#### Scenario: Send now
- **WHEN** a viewer chooses send now on a scheduled message and confirms
- **THEN** the message is sent as it would be for the accountant

#### Scenario: Retry after a failure
- **WHEN** a viewer chooses retry send on a failed send, or retry draft on a failed or stalled draft
- **THEN** the retry runs as it would for the accountant

#### Scenario: Regenerating a draft
- **WHEN** a viewer chooses regenerate on a scheduled draft
- **THEN** the draft is regenerated as it would be for the accountant

#### Scenario: Answering the agent's question
- **WHEN** a viewer types an answer on the client's questions tab and sends it
- **THEN** the answer is stored with the viewer as the answerer and the agent is woken, exactly as for the accountant

#### Scenario: From the monday object
- **WHEN** any of the above requests arrives from the monday custom object under a viewer's session
- **THEN** it is handled exactly as under a Google session

#### Scenario: Deleted client
- **WHEN** a viewer looks at a deleted client
- **THEN** no conversation-flow control is shown, as none is for the accountant
