## Context

`DocumentsCard.tsx` builds the tabs from the ordered list `CAPITAL_GROUPS` (one entry per status, some split by a `match` function), then appends the unmatched-files tab. A tab is shown only when it has rows. The tab in view is `tabs.find(key === tab) ?? tabs[0]`, so with no click the first non-empty tab is open. Labels come from `web/src/i18n.tsx`. The whole change is in the web client.

## Goals / Non-Goals

**Goals:**
- "נאספו" first, two "not required" tabs gone, two "replaced" tabs gone, two tabs renamed.

**Non-Goals:**
- No change to statuses, to the stored source of a "not required" decision, to the progress count, or to the admin cost page columns.
- No new place to list the hidden rows.

## Decisions

1. **Order by moving one entry.** Move the `approved` entry to the top of `CAPITAL_GROUPS`. The rest keep their order: unresolved, pending, claimed, collected, stated, not required by hand, unmatched files.
2. **The tab open by default becomes "נאספו"** when it has rows, because the existing rule opens the first non-empty tab. Alternative considered: keep "נדרשים" open by default with a special rule. Rejected for now — one simple rule (first tab opens) is easier to predict; the owner can ask for the other behaviour.
3. **Hide by removing the two entries** (`not_required_form`, `not_required_chat`) from `CAPITAL_GROUPS`, and remove their i18n keys and CSS selectors. `notRequiredSource` stays: the hand-marked tab still uses it. Rows hidden this way are not rendered anywhere on the card.
4. **Keep "לא נדרשים — סומנו ידנית".** A manual mark is the accountant's own action; without the tab there is no way to see it or to choose "return to required".
5. **Hide replaced rows by removing the two retired entries** (`retired`, `retired_declaration`) from `CAPITAL_GROUPS`, with their tab labels (`groupRetired`, `groupRetiredDeclaration`), the `replacedByDeclaration` helper and their CSS tab selectors. The row badge texts and the `replaced_by` column stay: the server still records what replaced a row, and the trace still names it.
6. **Renames are label-only.** `groupClaimed` → "סופקו ישירות למשרד", `groupUnmatchedFiles` → "קבצים ללא שיוך". Keys, statuses and the zip folder name ("קבצים שלא שויכו") are unchanged.

## Risks / Trade-offs

- A row the questionnaire or the conversation closed as "not required" can no longer be returned to required from the card → accepted by the owner's request ("useless"); the row is still in the data and in the trace, and the planner can still reopen it from the client's words.
- A replaced row can no longer be returned to required from the card → accepted by the owner's request ("redundant"); the planner can still reopen it.
- The header count ("18 / 22 נאספו") never counted these rows, so it does not move.
- A client whose only rows are hidden ones shows an empty tab area → show nothing in the tab area, as the card already does when no tab exists (`if (!active) return null`).

## Open Questions

- Should "לא נדרשים — סומנו ידנית" also be hidden? This plan keeps it (decision 4).
- Should the card open on "נדרשים" instead of "נאספו"? This plan opens the first tab (decision 2).
