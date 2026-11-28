## Why

The two filters above the client list look unrelated: "my clients only" is a plain checkbox and "questions for me" is a pill with a count. The count also confuses: it counts only the questions addressed to the signed-in person, while the row badges mark every open question, so the number looks wrong next to the list.

## What Changes

- The questions filter stays a press-on / press-off toggle, but its text becomes the fixed words "שאלות מהסוכן". It no longer shows a number.
- The "my clients" checkbox becomes a toggle with the same look as the questions toggle. Its text becomes "הלקוחות שלי" (the word "בלבד" is dropped). It carries a small person icon before the text.
- The two toggles sit on one row above the search box. Each takes half of the row width.
- A pressed toggle looks the same for both: raised background, accent border, bold text.
- The questions toggle now narrows the list to every client with an open question, whoever the question is addressed to. This matches the row badges. It is shown whenever at least one client in the loaded list has an open question. Its hover text says so.
- With both toggles pressed the list shows the signed-in person's own clients that have an open question.
- Nothing else changes: what "my clients" filters, when it is shown or hidden, its default state for a staff viewer, its hover text, and the row badges.

Assumptions recorded here:

- The owner wrote "שאלות מהסכון"; this is read as a typing mistake for "שאלות מהסוכן".
- "Questions of my clients" means: the client's tax advisor is the signed-in person and the client has an open question. The addressee of the question plays no part in the filter any more.
- When only one of the two toggles is shown, it keeps its own half of the row. The other half stays empty, so a toggle never changes size or place when the other one appears.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `team-questions`: the requirement "The sidebar shows open questions" — the control above the list is a toggle with fixed text and no number, it narrows to every client with an open question instead of the questions addressed to the signed-in person, sharing one row with the "my clients" toggle.
- `client-search`: the requirement "The list can be narrowed to the signed-in person's own clients" — the control is a toggle with an icon and the text "הלקוחות שלי" instead of a checkbox.

## Impact

- `web/src/components/Sidebar.tsx`: the two controls and a new person icon.
- `web/src/i18n.tsx`: the two texts (`sidebarMyClientsToggle`, `sidebarQuestionsForMe`) and the questions hover text.
- `web/src/format.ts`: `hasQuestionFor` is no longer used by the sidebar; remove it if nothing else uses it.
- `web/src/styles.css`: one shared toggle style and a two-column row.
- The same sidebar renders in the standalone app and in the monday custom object, so both change together.
- No backend, API, database or agent change.
