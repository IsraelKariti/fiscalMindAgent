## Purpose

How the workspace conversation panel (the client's message timeline, on the conversation tab and in the admin conversation viewer) scrolls: where it opens, when it follows new messages, and how the reader jumps to either end.

## ADDED Requirements

### Requirement: The timeline opens at the latest message and follows new ones
The conversation panel SHALL be its own scroll box (the page around it does not scroll on the dashboard layout). It SHALL open scrolled to the latest message. While the view is at or near the bottom, it SHALL stay at the bottom as content grows (new messages, trace rows loading, images decoding). Once the reader has scrolled up, content growth MUST NOT move the view.

#### Scenario: Reading older messages while a new one arrives
- **WHEN** the reader has scrolled up to an older message and a new message arrives
- **THEN** the view stays where the reader left it

#### Scenario: Waiting at the bottom
- **WHEN** the view is at the bottom and a new message arrives
- **THEN** the view scrolls so the new message is visible

### Requirement: Jump buttons at the ends of the timeline
The panel SHALL show the jump buttons only while the reader scrolls the chat and for a few seconds (about three) after the last scroll movement; when the chat has been still for longer than that, no button SHALL be shown. While the buttons are shown, the floating "to the latest message" button SHALL appear only when the view is not at the bottom, and the floating "to the first message" button only when the view is not at the top; a button whose end has been reached SHALL disappear at once. A pointer resting on a button SHALL keep it shown; it fades after the pointer leaves. The buttons SHALL float over the panel's own scroll box (not the page), SHALL NOT cover the composer or the panel header, SHALL be reachable with the keyboard, SHALL carry a Hebrew accessible label, and SHALL NOT use browser-native dialogs.

Pressing "to the latest message" SHALL scroll the view to the bottom and SHALL re-enable following: new messages that arrive afterwards keep the view at the bottom again. Pressing "to the first message" SHALL scroll the view to the top and SHALL leave following off.

On the narrow layout, where the page itself scrolls and the panel has no scroll box of its own, no jump buttons SHALL be shown.

#### Scenario: Scrolled up on a long chat
- **WHEN** the reader scrolls up from the bottom of a chat that is taller than the panel
- **THEN** the "to the latest message" button appears while scrolling; pressing it scrolls to the newest message and the button disappears; a message that arrives after that is shown at the bottom without further scrolling by the reader

#### Scenario: Chat left still
- **WHEN** the reader stops scrolling in the middle of a long chat and does not touch it for a few seconds
- **THEN** both buttons fade out; the next scroll movement brings them back

#### Scenario: At the top
- **WHEN** the reader scrolls to the very top of the chat
- **THEN** the "to the first message" button is not shown and the "to the latest message" button is shown until the chat has been still for a few seconds

#### Scenario: Short chat
- **WHEN** the whole chat fits in the panel without scrolling
- **THEN** no jump button is shown

#### Scenario: Keyboard
- **WHEN** the reader tabs to a jump button (shown or not; a hidden button is still in the tab order) and presses Enter or Space
- **THEN** the button is shown while focused and the view scrolls to that end, as with a click

#### Scenario: Narrow screen
- **WHEN** the workspace is shown below the dashboard breakpoint (stacked panels, page scroll)
- **THEN** no jump button is shown
