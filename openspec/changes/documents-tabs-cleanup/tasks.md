## 1. Labels

- [x] 1.1 In `web/src/i18n.tsx` change `groupClaimed` to 'סופקו ישירות למשרד' and `groupUnmatchedFiles` to 'קבצים ללא שיוך'; verify no other file holds the two old texts (grep `web/src`, `src`, `docs`)
- [x] 1.2 Remove the keys `groupNotRequiredForm`, `groupNotRequiredChat`, `groupRetired` and `groupRetiredDeclaration` from `web/src/i18n.tsx` (every language block); verify the web typecheck passes after task 2.1

## 2. Tabs

- [x] 2.1 In `CAPITAL_GROUPS` (`web/src/components/DocumentsCard.tsx`) move the `approved` entry to the top and delete the `not_required_form`, `not_required_chat`, `retired` and `retired_declaration` entries and the now-unused `replacedByDeclaration` helper if nothing else uses it (kept: the row badge still uses it); update the comment above the list (order, and that questionnaire/conversation "not required" rows and retired rows are not shown); keep `not_required_accountant` and the `notRequiredSource` import
- [x] 2.2 Remove `.doc-group-not_required_form`, `.doc-group-not_required_chat`, `.doc-group-retired` and `.doc-group-retired_declaration` from the tab-dot rule in `web/src/styles.css`; verify the hand-marked tab's dot is still grey

## 3. Verification

- [x] 3.1 Run `npm run typecheck` and `npm test`; verify both pass
- [ ] 3.2 Browser check on a local client that has approved, pending, claimed, questionnaire "not required" and unmatched rows: "נאספו" is first on the right and open by default, no "לא נדרשים — לפי השאלון" / "לפי השיחה" tab, no "הוחלפו" tab on a client that has a retired row, the claimed tab reads "סופקו ישירות למשרד", the last tab reads "קבצים ללא שיוך", and the header count is the same as before
- [ ] 3.3 Mark a pending row "not required" by hand and verify the "לא נדרשים — סומנו ידנית" tab appears and "return to required" works; then commit per the Git workflow
