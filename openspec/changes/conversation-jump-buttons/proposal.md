## Why

The client conversation panel is a fixed-height scroll box with no way to jump to its ends: on a long chat (many messages, or the admin trace switched on) the reader has to drag the scroll bar to reach the first or the latest message, and after scrolling up there is no one-click way back to the newest message.

## What Changes

- Two floating jump buttons over the conversation panel's scroll box: "to the latest message" (bottom) and "to the first message" (top).
- The buttons appear only while the reader is scrolling and for a few seconds after the scrolling stops; a still, untouched chat shows no buttons. Within that window, the bottom button shows only while the view is not at the bottom and the top button only while the view is not at the top.
- Pressing the bottom button scrolls to the newest message and re-enables the existing follow behaviour (the view keeps following new messages again).
- Keyboard-accessible, labelled buttons; no browser dialogs; no change to what is shown or to who can see what.
- Narrow screens (the stacked layout below the dashboard breakpoint, where the page itself scrolls) get no buttons.

## Capabilities

### New Capabilities
- `conversation-timeline`: how the workspace conversation panel scrolls: opening at the latest message, following new messages unless the reader scrolled up, and the jump-to-top / jump-to-bottom buttons.

### Modified Capabilities
- (none)

## Impact

- `web/src/components/Timeline.tsx` (buttons, scroll tracking) and `web/src/styles.css` (floating position, hidden on narrow screens).
- Two new Hebrew labels in `web/src/i18n.tsx`.
- No API, database or agent-pipeline change. Both surfaces that render the timeline (workspace conversation tab, admin conversation viewer) get the buttons.
