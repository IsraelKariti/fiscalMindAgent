# client-status-indicator Specification

## Purpose
What the colored dot next to a client's name means in the accountant's client list (sidebar) and in the overview list: whether the agent is still working on the client, finished with them, or was refused.

## Requirements

### Requirement: The client dot has three colors with one meaning each
Every client row in the sidebar list and in the overview list SHALL show a dot whose color is decided by the same rule: **green** when the agent is finished with the client, that is when the goal is complete (every document collected) or when the collection window ended and the agent stopped chasing; **red** when the client refused the WhatsApp collection and the agent stopped; **yellow**, pulsing, in every other case (the collection is in progress inside the window, including a paused, held, or never-contacted client). A client that both refused and has a passed due date SHALL be red. A deleted client SHALL keep the dot of its recorded state.

#### Scenario: All documents collected
- **WHEN** a client's goal is complete
- **THEN** the dot is green in the sidebar and in the overview list

#### Scenario: Window ended
- **WHEN** a pending client was stopped because its due date passed
- **THEN** the dot is green in both lists

#### Scenario: Client refused
- **WHEN** a pending client declined the WhatsApp collection and is stopped
- **THEN** the dot is red in both lists

#### Scenario: In progress
- **WHEN** a pending client is being chased, or is paused by the accountant, or is waiting for its held first message
- **THEN** the dot is yellow and pulsing in both lists

#### Scenario: Resumed after a refusal
- **WHEN** the accountant resumes a refused client
- **THEN** the dot turns yellow again

### Requirement: The dot's hover text names the exact state
The dot SHALL carry a hover text (title) in Hebrew that names the state behind the color: all documents received; the due date passed and the file is in the accountant's hands; the client refused and the file is in the accountant's hands; collection in progress. The two green states SHALL have different hover texts.

#### Scenario: Two green dots
- **WHEN** one client is complete and another was stopped at the window's end
- **THEN** both dots are green, the first hover text says the documents were received and the second says the due date passed

#### Scenario: Red dot
- **WHEN** the accountant hovers the dot of a refused client
- **THEN** the hover text says the client refused and the file is in the accountant's hands
