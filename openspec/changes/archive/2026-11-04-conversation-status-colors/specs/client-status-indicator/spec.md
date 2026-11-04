## RENAMED Requirements
- FROM: `### Requirement: The client dot has three colors with one meaning each`
- TO: `### Requirement: The client dot has four colors with one meaning each`

## MODIFIED Requirements

### Requirement: The client dot has four colors with one meaning each
Every client row in the sidebar list and in the overview list SHALL show a dot whose color is decided by the same rule: **green** when the goal is complete (every document collected); **red** when the client refused the WhatsApp collection and the agent stopped; **orange** when the collection window ended (the due date passed and the agent stopped) and the documents were not fully collected; **blue**, pulsing, in every other case (the collection is in progress inside the window, including a paused, held, or never-contacted client). Precedence SHALL be refused, then complete, then window ended, then in progress: a client that both refused and has a passed due date SHALL be red. A deleted client SHALL keep the dot of its recorded state.

#### Scenario: All documents collected
- **WHEN** a client's goal is complete
- **THEN** the dot is green in the sidebar and in the overview list

#### Scenario: Window ended
- **WHEN** a pending client was stopped because its due date passed
- **THEN** the dot is orange in both lists

#### Scenario: Client refused
- **WHEN** a pending client declined the WhatsApp collection and is stopped
- **THEN** the dot is red in both lists

#### Scenario: In progress
- **WHEN** a pending client is being chased, or is paused by the accountant, or is waiting for its held first message
- **THEN** the dot is blue and pulsing in both lists

#### Scenario: Refused and overdue
- **WHEN** a declined client's due date has also passed
- **THEN** the dot is red, not orange

#### Scenario: Resumed after a refusal
- **WHEN** the accountant resumes a refused client
- **THEN** the dot turns blue again

#### Scenario: Resumed after the window ended
- **WHEN** the accountant resumes a window-ended client
- **THEN** the dot turns blue again

### Requirement: The dot's hover text names the exact state
The dot SHALL carry a hover text (title) in Hebrew that names the state behind the color: all documents received; the due date passed and the file is in the accountant's hands; the client refused and the file is in the accountant's hands; collection in progress. Each of the four colors SHALL have its own hover text.

#### Scenario: Two green dots
- **WHEN** one client is complete and another was stopped at the window's end
- **THEN** the first dot is green with the hover text that the documents were received, and the second dot is orange with the hover text that the due date passed (the two are no longer both green)

#### Scenario: Orange dot
- **WHEN** the accountant hovers the dot of a client stopped at the window's end
- **THEN** the hover text says the due date passed and the file is in the accountant's hands

#### Scenario: Red dot
- **WHEN** the accountant hovers the dot of a refused client
- **THEN** the hover text says the client refused and the file is in the accountant's hands
