## 1. Texts

- [x] 1.1 In `web/src/i18n.tsx` change `sidebarMyClientsToggle` to "הלקוחות שלי" and turn `sidebarQuestionsForMe` into the fixed text "שאלות מהסוכן" (no count argument), in every language block that has these keys; verify `npm run typecheck` passes after the caller in 2.2 is updated

## 2. Sidebar controls

- [x] 2.1 In `web/src/components/Sidebar.tsx` add a person icon (outline style, same stroke as the other icons in the `icon` map) and replace the "my clients" checkbox label with a `button` toggle (`aria-pressed`, same hover text, toggles `myOnly`); verify it still shows only when `assignedCount > 0` and opens pressed for a staff viewer
- [x] 2.2 Make the questions toggle count and filter on any open question (`client.openTeamQuestion` present) instead of `hasQuestionFor(client, meEmail)`; update `sidebarQuestionsForMeTitle` to say it keeps the clients the agent has an open question about; remove `hasQuestionFor` from `web/src/format.ts` (and its test) if nothing else uses it; verify that with both toggles pressed and no common client the list shows the "no client matches" message and both toggles stay visible
- [x] 2.3 Render the questions toggle with the fixed text (no count) and wrap both toggles in one row element placed above the search box; the "deleted clients" checkbox stays as it is; verify the row is not rendered when neither toggle shows

## 3. Styles

- [x] 3.1 In `web/src/styles.css` add the row as a two-equal-column grid with the sidebar's side margins, and one shared toggle style (pill, centered content, text that does not wrap, pressed state = raised background + accent border + bold) used by both toggles; remove the now-unused `sidebar-for-me-chip` rules; verify in the browser that both toggles have the same width and a lone toggle keeps its half

## 4. Checks

- [x] 4.1 Run `npm run typecheck` and `npm test`; both pass
- [ ] 4.2 In the running app (owner's dev stack), open an agent with open questions to several people and with clients assigned to the viewed person: both toggles are on one row with equal width, texts are "שאלות מהסוכן" and "הלקוחות שלי", no number shows, the questions toggle lists every client with a badge, both toggles together list only the viewed person's clients with a badge, and a second press restores the list
- [ ] 4.3 Run `npm run build:gui` and confirm the monday custom object shows the same row
