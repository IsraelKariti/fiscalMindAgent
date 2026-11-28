## Why

The "הלקוחות שלי" toggle above the client list can only show the signed-in person's own clients. A person in the office cannot see the clients of one colleague, for example to cover for a tax advisor who is away.

## What Changes

- The "הלקוחות שלי" toggle stops being a toggle. It becomes a button that opens a picker of tax advisors.
- The picker lists, from top to bottom: "הכל" (every client), "אני" (the signed-in person's clients), then every other tax advisor of the office in alphabetical order by name.
- The other tax advisors are the people stored as tax advisor on at least one client of the loaded list. No new list is kept and no server change is needed.
- Picking an option closes the picker and narrows the client list to that advisor's clients. Picking "הכל" shows every client.
- The button shows the current choice: "כל היועצים", "הלקוחות שלי", or the picked advisor's name. It looks pressed whenever the choice is not "הכל".
- The button is shown whenever at least one client of the loaded list has a stored tax advisor. Today the toggle shows only when the signed-in person has own clients.
- The opening choice stays as today: "אני" for a staff viewer who has own clients, "הכל" for everybody else. The choice is not kept across page reloads.
- The "שאלות מהסוכן" toggle beside it does not change. The two controls keep one row with two equal halves.
- The search box, the color buttons and the questions toggle keep applying inside the picked advisor's clients.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `client-search`: the requirement "The list can be narrowed to the signed-in person's own clients" becomes a tax advisor picker (renamed "The list can be narrowed to one tax advisor's clients"). The requirement "The list can be narrowed to one dot color" counts after the picker's narrowing instead of after the checkbox.
- `team-questions`: the requirement "The sidebar shows open questions" refers to the picker instead of the "my clients" toggle; its own behaviour does not change.

## Impact

- `web/src/components/Sidebar.tsx`: the toggle and its `myOnly` state are replaced by the picker and a chosen-advisor state.
- `web/src/components/Dropdown.tsx`: small optional props so the picker can reuse the styled list with the pill-shaped button.
- `web/src/format.ts` (+ test): one function that builds the advisor options from the client list, one that says whether a client belongs to a picked advisor.
- `web/src/i18n.tsx`, `web/src/styles.css`: new texts and the picker's button style.
- No API, database or agent change. The monday custom object gets the same sidebar after `npm run build:gui`.
- Depends on the open change `sidebar-filter-toggles`: that change must be archived first, because both change the same requirement text.
