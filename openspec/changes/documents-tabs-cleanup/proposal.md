## Why

The documents card of a client shows up to eleven status tabs. Two of them ("לא נדרשים — לפי השאלון", "לא נדרשים — לפי השיחה") list rows the accountant never acts on, and they push the useful tabs onto a second line. Two other tab names are long and unclear, and the tab the accountant looks for first ("נאספו") sits in the middle of the row.

## What Changes

- The green "נאספו" tab is always the first tab (rightmost in the right-to-left layout), whenever it has at least one row.
- The tabs "לא נדרשים — לפי השאלון" and "לא נדרשים — לפי השיחה" are no longer shown. Their rows appear nowhere on the card. The data is unchanged.
- The tab "לא נדרשים — סומנו ידנית" stays, because it is the only place where the accountant can undo a manual "not required" mark. (Open question for the owner — see design.)
- The tabs "הוחלפו במסמכים אחרים" and "הוחלפו בהצהרת הלקוח" are no longer shown. A row that was replaced (by other documents or by the client's declaration) appears nowhere on the card. The data, and the record of what replaced the row, are unchanged.
- The tab "קבצים ללא התאמה למסמך נדרש" is renamed "קבצים ללא שיוך".
- The tab "סופקו כבר — ממתינים לאישורך" is renamed "סופקו ישירות למשרד".
- All other tabs ("בבירור מול הלקוח", "נדרשים", "התקבלו — באימות", "הוצהרו בצ'אט") keep their names and their relative order.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workspace-documents`: tab order (collected first), which "not required" rows the card shows, replaced rows no longer shown, and the names of the claimed tab and of the unmatched-files tab.
- `document-cost-analytics`: one scenario quotes the old tab names; it is reworded. The columns and their numbers do not change.

## Impact

- `web/src/components/DocumentsCard.tsx` — the tab list (`CAPITAL_GROUPS`).
- `web/src/i18n.tsx` — two labels changed, four tab labels removed.
- `web/src/styles.css` — the tab-dot rule of the four removed tabs.
- No server, database, prompt or API change. The admin cost page still counts questionnaire and conversation rows.
