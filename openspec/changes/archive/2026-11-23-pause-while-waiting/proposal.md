## Why

The accountant can pause a client only from the scheduled-message bubble. Most of the time the agent has nothing scheduled: it sent its message and waits for the client's reply (or for the after-send delay). In that state the conversation tab has no pause control at all, so the accountant cannot stop the agent before the next reply arrives — for example to take the conversation over by phone, or to stop the agent from answering a client who called the office.

## What Changes

- The conversation tab gets a pause control that is available whenever the client's goal is open and the client is not paused, not only on a scheduled-message bubble. It sits in the timeline's header row (beside the message count and the copy button), so it does not add a row to a timeline that must "end at the last message" while the agent waits (openspec `inbound-turn`).
- The scheduled bubble keeps its own pause / resume controls exactly as today; the header control is shown only when no scheduled bubble carries one (nothing is scheduled, or the scheduled draft is held for admin review).
- Pausing a client with nothing scheduled uses the existing pause route and the existing paused state: the client is marked paused, nothing is sent, a reply that arrives is stored but not answered, and the timeline shows today's paused notice with its Resume button.
- Resuming after such a pause re-plans from the current state, as a resume with no preserved draft already does today: the agent drafts the next message (and may schedule it for later).
- A staff viewer and an admin viewing as the accountant see the control where the accountant does; a deleted client and a completed goal show none.

No server change is needed: the pause route already accepts a client with nothing scheduled, and the worker already refuses to schedule a send for a paused client.

## Capabilities

### New Capabilities
- `conversation-pause`: when the accountant can pause and resume the agent's outreach to a client from the conversation tab, what a pause does to a client with nothing scheduled, and what resume does afterwards.

### Modified Capabilities
<!-- none: `inbound-turn`'s "nothing while waiting" rule is about timeline rows and is kept; `accountant-staff-access` already grants pause/resume to viewers wherever the accountant sees them -->

## Impact

- `web/src/components/Timeline.tsx`: a header pause button wired to the existing `onTogglePause`, sharing the busy / error state of the bubble controls.
- `web/src/i18n.tsx`: one tooltip string for the header control (the button text reuses the existing "השהה" label).
- `web/src/styles.css`: placement of the button in the header row.
- `tests/`: a pure-rule test for when the header control is shown.
- No API, database, queue or agent-prompt change.
