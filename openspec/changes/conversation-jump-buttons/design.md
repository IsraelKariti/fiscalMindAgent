## Context

`Timeline.tsx` already owns the scroll box (`.panel-body`, `bodyRef`): `trackScroll` keeps `nearBottomRef` (within 80px of the bottom) on every scroll event, and a `ResizeObserver` effect re-pins the view to the bottom while `nearBottomRef` is true. `.panel` is a flex column with `overflow: hidden`; `.panel-footer` (composer / actions) sits below the scroll box. Below 1100px the panel loses its own scroll (`.panel-body { overflow: visible }`) and the page scrolls. The app is RTL (`<html dir="rtl">`); labels live in `web/src/i18n.tsx`.

## Goals / Non-Goals

**Goals:**
- One-click jump to either end from inside the existing scroll box, with the follow behaviour restored by the bottom jump.
- Buttons visible only when they do something, and only while the reader is scrolling (plus a short grace period), so a still chat has no overlay.

**Non-Goals:**
- Paging / lazy-loading older messages (all messages still load at once).
- A "new messages" unread counter on the bottom button.
- Any change to the admin trace, modals, or message rendering.

## Decisions

- **Visibility from scroll state, not from message count.** `trackScroll` already runs on scroll; extend it to set two booleans in React state (`atTop`, `atBottom`) and also recompute them from the `ResizeObserver` callback (content growth can make a short chat scrollable without a scroll event). Thresholds: top = `scrollTop <= 4`, bottom = the existing 80px rule, so the bottom button and the follow logic agree. Short chat: both true, so no buttons.
  - Alternative: an `IntersectionObserver` on sentinel elements at both ends. Rejected: `trackScroll` is already there, and sentinels inside the `<ol>` would disturb the `:nth-child` animations on `.timeline-item`.
- **Show on scroll, fade when still.** `trackScroll` also sets a `scrolling` boolean and restarts a 3s timer (`useRef` timeout) that clears it; the timer is cleared on unmount. The buttons render whenever their end is not reached, but get a `visible` class only while `scrolling`, or while hovered or focused (CSS `:hover` / `:focus-visible` on the button, plus a `data-visible` attribute from state). Hidden buttons use `opacity: 0; pointer-events: none` with a `transition: opacity .25s`, so they fade rather than pop, stay in the tab order, and cannot be clicked by accident while invisible. Keeping them mounted (instead of unmounting) is what lets the keyboard reach them and the fade animate.
  - Alternative: unmount when idle. Rejected: no fade, and keyboard users could never reach the buttons.
- **Bottom jump re-arms following.** Set `nearBottomRef.current = true`, then `el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })`. Smooth scrolling fires scroll events mid-way; `trackScroll` recomputes the ref on each, and the final event lands within 80px, so following is on once the scroll finishes. The top jump calls the same with `top: 0` and does not touch the ref (the final scroll event sets it false).
- **Placement.** Make `.panel` `position: relative` and render the two buttons as siblings of `.panel-body` with `position: absolute`, anchored at the inline-start edge, the bottom one just above `.panel-footer` and the top one just below `.panel-header`. Sticky positioning inside the scroll box was rejected: a sticky element still takes layout space and would shift the timeline.
- **Narrow layout.** Hide the buttons with the existing `@media (max-width: 1100px)` block (`display: none`), matching where `.panel-body` loses its scroll.
- **Markup.** `<button type="button" className="timeline-jump timeline-jump-bottom" aria-label={t.timelineJumpToLatest} title={...}>` with a text glyph (↓ / ↑). New i18n keys `timelineJumpToLatest`, `timelineJumpToFirst`.

## Risks / Trade-offs

- [Programmatic scrolls (the jump itself, `focusedMessageId`, the follow pin) fire scroll events and would show the buttons on their own] → acceptable for the jump and the focus scroll (the reader caused them); for the follow pin on new content, skip the timer when the scroll event arrives while `nearBottomRef` was already true and the view is still at the bottom, so a chat left at the bottom stays clean when messages arrive.
- [Smooth scroll on a very long trace feels slow] → acceptable; browsers honour `prefers-reduced-motion` for `behavior: 'smooth'`, and the jump is still one click.
- [`focusedMessageId` scrolls a bubble into view with `scrollIntoView`] → that path already sets `nearBottomRef` false through the scroll event; the buttons simply reflect the new position. No change needed.
- [The admin conversation viewer modal scrolls itself (`maxHeight: 85vh; overflowY: auto`)] → the buttons are absolute inside `.panel`, which is inside the modal, so they stay inside it; verify in the browser.
