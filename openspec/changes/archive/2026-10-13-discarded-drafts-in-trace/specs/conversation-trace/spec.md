## ADDED Requirements

### Requirement: Discarded drafts are shown with the LLM calls
A draft the agent threw away in a re-plan (a "regenerate" by the admin, a reply that arrived before the send, a resume that redrafted) SHALL stay part of the admin trace. While the **LLM calls** toggle of the workspace timeline is on, the timeline SHALL show every discarded draft of the client as a muted outbound bubble, in time order by the moment the draft was written, carrying the draft's text and a "discarded draft" badge. The bubble SHALL offer no action: no approve, no send now, no regenerate, no pause.

While the **LLM calls** toggle is on, the `generate_message` call that wrote a discarded draft SHALL show like any other call row. The `send_reply` step of a discarded draft SHALL show only while both toggles (LLM calls and code steps) are on.

With the **LLM calls** toggle off, the timeline SHALL look exactly as before: no discarded draft, no call that only produced one, no step of one. Discarded drafts SHALL never count in the timeline's message count and SHALL never be shown to an accountant, who has no trace toggle.

#### Scenario: Admin regenerates a scheduled draft
- **WHEN** an impersonating admin presses "regenerate" on a scheduled draft and the agent writes a new one, with the LLM calls toggle on
- **THEN** the old draft stays in the timeline as a muted bubble with the "discarded draft" badge, placed at the time it was written, and the new draft shows as the scheduled bubble after it

#### Scenario: Admin regenerates from the review queue
- **WHEN** an admin presses "regenerate" on a message in the review queue and later opens that client's conversation with the LLM calls toggle on
- **THEN** the regenerated-away draft shows as a discarded-draft bubble, and the draft now waiting for approval shows as the live scheduled bubble

#### Scenario: Several regenerations
- **WHEN** the admin regenerated the same message three times
- **THEN** the three old drafts show as three discarded-draft bubbles in the order they were written, each with its own `generate_message` call row before it

#### Scenario: Toggle off
- **WHEN** the LLM calls toggle is off
- **THEN** no discarded draft, no call that only produced a discarded draft, and no step of a discarded draft is shown, and the message count is unchanged

#### Scenario: Only code steps on
- **WHEN** the code steps toggle is on and the LLM calls toggle is off
- **THEN** the `send_reply` step of a discarded draft stays hidden

#### Scenario: Both toggles on
- **WHEN** both toggles are on
- **THEN** the discarded draft shows with its `generate_message` call before it and its `send_reply` step after it

#### Scenario: No action on a discarded draft
- **WHEN** a discarded-draft bubble is shown
- **THEN** it offers no approve, send now, regenerate or pause control, and the live scheduled bubble keeps its own controls as today

#### Scenario: Accountant
- **WHEN** an accountant opens the conversation tab of a client whose draft was regenerated
- **THEN** no discarded draft is shown and the message count is unchanged

#### Scenario: Admin conversation viewer
- **WHEN** an admin opens the same client in the admin conversation viewer
- **THEN** the discarded drafts show there as before, with their "discarded draft" badge
