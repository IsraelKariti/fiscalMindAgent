## 1. Advisor list logic

- [x] 1.1 In `web/src/format.ts` add `advisorOptionsOf(clients, meEmail)` (distinct advisors keyed by lower-cased email, or by `name:<name>` when there is no email; the signed-in person left out; sorted by name with the Hebrew locale) and `isAdvisedBy(client, choice, meEmail)` for `'all'`, `'me'` and a key; verify with new unit tests for: order, same email in two letter cases listed once, signed-in person not repeated, advisor without an email, client with no advisor matched only by `'all'`

## 2. Texts

- [x] 2.1 In `web/src/i18n.tsx` add the picker texts ("הכל", "אני", "כל היועצים", hover text saying the button picks whose clients are listed), keep `sidebarMyClientsToggle` ("הלקוחות שלי") as the button text for "אני", and replace `sidebarMyClientsToggleTitle`; do it in every language block that has these keys; verify `npm run typecheck` passes

## 3. Picker

- [x] 3.1 In `web/src/components/Dropdown.tsx` add the optional props of design decision 4 (trigger class, custom trigger content, minimum list width); verify existing callers compile unchanged and one existing dropdown still opens and picks in the browser
- [x] 3.2 In `web/src/components/Sidebar.tsx` replace `myOnly` and the "my clients" toggle with the chosen-advisor state and the picker (options "הכל", "אני", then `advisorOptionsOf`), show it when at least one client has a stored advisor, derive the effective choice as in design decisions 5 and 6, and filter `baseClients` with `isAdvisedBy`; verify the color counts and the questions toggle still apply inside the picked advisor's clients
- [x] 3.3 In `web/src/styles.css` give the picker's button the `sidebar-filter-toggle` pill look (pressed look when the choice is not "הכל", text cut with an ellipsis) in the first half of the row, and remove rules left unused; verify in the browser that the picker and the questions toggle have the same width and a control shown alone keeps its half

## 4. Checks

- [x] 4.1 Run `npm run typecheck` and `npm test`; both pass
- [ ] 4.2 In the running app (owner's dev stack), as the accountant: the button reads "כל היועצים"; the picker lists "הכל", "אני", then the other advisors in alphabetical order; picking a colleague shows only that colleague's clients and the button shows the name and looks pressed; "הכל" restores the list; Escape and a press outside close the picker without a change
- [ ] 4.3 In the running app, as a staff viewer with own clients: the page opens with "הלקוחות שלי" pressed and only the own clients listed; with the questions toggle pressed too, only own clients with an open question are listed
- [ ] 4.4 Run `npm run build:gui` and confirm the monday custom object shows the same picker
