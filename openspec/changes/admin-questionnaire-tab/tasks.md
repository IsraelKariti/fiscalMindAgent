## 1. Plumb the admin view-as state into client tabs

- [x] 1.1 Add `adminOnly?: boolean` to `ClientTab` and `admin: boolean` to `ClientTabContext` in `web/src/agents/types.ts`, with doc comments naming openspec `admin-questionnaire-tab`; verify `npm run typecheck` passes.
- [x] 1.2 Give `ClientView` an `admin` prop (default false), filter `agentUI.clientTabs` to drop `adminOnly` tabs when `admin` is false or `viewer` is true, use the filtered list for the remembered-tab fallback and the tab bar, and render an admin-only tab button with `client-tab-admin`, the `admin-chip` span and the `adminOnlyTabTitle` tooltip like `Settings.tsx`; verify by reading the JSX that the accountant path (`admin=false`) never renders the button.
- [x] 1.3 Pass `admin={Boolean(impersonatingEmail)}` from `Workspace.tsx` to `ClientView`; verify `npm run typecheck` passes.

## 2. The questionnaire data on the web client type

- [x] 2.1 Declare `form_answers?: Array<{ question: string; answer: string }>` on `ClientAgentFields` in `web/src/api.ts` (comment: written at kickoff / test form, blank answers never stored).
- [x] 2.2 Add `web/src/components/questionnairePairs.ts` exporting `questionnairePairs(fields): Array<{question, answer}>` that keeps only well-formed pairs with a non-blank answer, in stored order; add `tests/questionnairePairs.test.ts` (node:test, like `tests/timelineRows.test.ts`) covering a good list, a malformed entry, a blank answer and a missing key, register it in the `test` script, and verify `npm test` passes.

## 3. The tab

- [x] 3.1 Add i18n strings in `web/src/i18n.tsx`: `tabQuestionnaire` ("שאלון"), `questionnaireEmpty` (no questionnaire is stored for this client), `questionnaireEmptyNote` (only answered questions are stored; blank answers are not kept); verify `npm run typecheck` passes (the `MessageStringKey` type picks the label up).
- [x] 3.2 Create `web/src/components/QuestionnaireCard.tsx`: takes the client, calls `questionnairePairs`, renders one `.questionnaire-card` per pair (question as the card heading, answer in a `white-space: pre-wrap` block, text only, no markdown pane) or the empty state with its note; verify by reading that no `dangerouslySetInnerHTML`, markdown or link detection is used.
- [x] 3.3 Add `.questionnaire-card` styles to `web/src/styles.css` next to the other panel-stack cards (RTL, question heading small and muted, answer body regular), reusing existing card tokens; verify the pane looks like the Details tab cards in the browser.
- [x] 3.4 Append the tab to `clientTabs` in `web/src/agents/declarationOfCapital.tsx` with `id: 'questionnaire'`, `labelKey: 'tabQuestionnaire'`, `adminOnly: true`, rendering `QuestionnaireCard` inside `tab-pane panel-stack`; verify `npm run typecheck` passes.

## 4. Verify and document

- [ ] 4.1 Browser check under admin view-as on the local stack: open the test client "בדיקה" (it was created with questionnaire answers) and confirm the fifth tab "שאלון" with the admin chip shows one card per answer in order; open a client without answers and confirm the empty state; confirm an answer containing `<b>` shows literally (use the test form to create one if needed).
- [ ] 4.2 Browser check as the accountant (own session) and as a staff viewer: confirm no "שאלון" tab, and that a client last viewed on the questionnaire tab under view-as opens on Conversation.
- [x] 4.3 Add a short note to `docs/agents.md` (frontend section, near the admin-test-client bullet) describing the admin-only questionnaire tab and the `adminOnly` tab flag; verify the note names openspec `admin-questionnaire-tab`.
- [ ] 4.4 Run `npm run typecheck` and `npm test`, then commit per the repo Git workflow (pull --rebase, commit, push).
