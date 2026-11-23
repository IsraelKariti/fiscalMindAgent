## 1. Visibility rule

- [x] 1.1 Add the pure rule `showHeaderPause({ readOnly, goalStatus, paused, nextScheduled, pendingReview })` next to `resolveTurnActivity` in `web/src/components/turnActivity.ts`; verify with `npm run typecheck`
- [x] 1.2 Add cases to `tests/turnActivity.test.ts` (waiting → shown; scheduled → hidden; scheduled but held for admin review → hidden; paused → hidden; goal complete → hidden; deleted/readOnly → hidden) and add the new test to the `test` script if it is a new file; verify with `npm test`

## 2. Header control

- [x] 2.1 In `web/src/components/Timeline.tsx` render a pause button in the header row (after the message count, before the copy button) when `showHeaderPause` is true, calling `togglePause(true)` and sharing `pauseBusy`; verify by opening a client whose agent waits for a reply and seeing the button with the "השהה" label
- [x] 2.2 Add the tooltip string `pauseConversationTitle` to `web/src/i18n.tsx` (Hebrew: the agent sends nothing until resumed) and the button styling in `web/src/styles.css` so it matches the header icon buttons; verify visually in the browser (RTL layout, no overlap with the toggles)

## 3. End-to-end check

- [x] 3.1 On a local test client with a delivered message and nothing scheduled: press the header pause; verify the client becomes paused, the paused notice with Resume appears, the header button disappears, and the worker log shows no send or draft
- [ ] 3.2 Send a WhatsApp message (or a file) to the paused client; verify it appears in the timeline and the agent does not answer
- [ ] 3.3 Press Resume; verify the drafting notice appears and then a scheduled message that reflects the message sent during the pause
- [ ] 3.4 Open the same client as a staff viewer (openspec `accountant-staff-access`) and as admin view-as; verify the header pause control shows and works; open a deleted client as admin and verify no control
