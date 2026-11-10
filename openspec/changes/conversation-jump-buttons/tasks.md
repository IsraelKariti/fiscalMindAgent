## 1. Scroll state and buttons

- [x] 1.1 In `web/src/components/Timeline.tsx`, add `atTop` / `atBottom` state computed in `trackScroll` (top = scrollTop <= 4px, bottom = the existing 80px rule) and recomputed from the `ResizeObserver` callback; verify with `npm run typecheck`.
- [x] 1.2 Add a `scrolling` state set by `trackScroll` with a 3s reset timer (cleared on unmount; not started by the follow pin when the view was already at the bottom). Render the two jump buttons as siblings of `.panel-body` inside `.panel`: bottom button only when `!atBottom`, top button only when `!atTop`, each with `data-visible` = `scrolling`; the bottom jump sets `nearBottomRef.current = true` then smooth-scrolls to `scrollHeight`, the top jump smooth-scrolls to 0; `type="button"`, `aria-label` + `title` from new i18n keys `timelineJumpToLatest` / `timelineJumpToFirst` in `web/src/i18n.tsx`. Verify by typecheck and by opening a long client conversation locally: scroll up, the bottom button appears, click it, the view is at the newest message and the button is gone; stop scrolling mid-chat and confirm both buttons fade after about three seconds and come back on the next scroll.

## 2. Styles

- [x] 2.1 In `web/src/styles.css`: `.panel { position: relative }`, `.timeline-jump` absolute at the inline-start edge, the bottom one above the footer and the top one under the header, round, shadowed, with a focus ring; hidden state `opacity: 0; pointer-events: none` with a 0.25s opacity transition, shown when `data-visible="true"`, `:hover` or `:focus-visible`; hide both under the existing `@media (max-width: 1100px)` block. Verify in the browser at 1100px or wider (buttons float over the chat and cover neither header nor composer) and narrower (no buttons); confirm a hidden button cannot be clicked and a Tab-focused one becomes visible.

## 3. Checks

- [ ] 3.1 Verify the follow behaviour: with the view at the bottom (after the jump), let a new message arrive and confirm the view stays pinned; with the view scrolled up, confirm it does not move. Verify the admin conversation viewer modal shows the same buttons inside the modal.
- [ ] 3.2 Run `npm run typecheck` and `npm test`, then commit per the Git workflow (pull --rebase, commit, push).
