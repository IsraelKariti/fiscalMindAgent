## Context

- `Sidebar.tsx` holds `clientQuery` state, filters with `clientMatchesQuery`, and computes each row's dot with `clientDotState` (web/src/format.ts) from `isOverdueStopped` / `isDeclined`. The list it receives is already the live list or the deleted list (admin toggle `showDeleted`).
- The dot states are `refused | done | window_ended | in_progress`; the control's colors are coarser: green = `done` + `window_ended`, yellow = `in_progress`, red = `refused`.
- The search box is a plain `<input type="search">` styled by `.sidebar-search`; there is no segmented-control style in `styles.css` yet.

## Goals / Non-Goals

**Goals:**
- One pressed-button bar, readable at the sidebar's width, counts included.
- The filter reuses the dot rule so the control and the dots can never disagree.

**Non-Goals:**
- Filtering the overview list or the admin pages.
- Remembering the choice across reloads.
- Multi-select.

## Decisions

1. **Color, not state, as the filter key.** `type DotColor = 'all' | 'green' | 'yellow' | 'red'`; `dotColorOf(state)` in `format.ts` maps the four states to three colors. The control filters by color because that is what the accountant sees; the hover text of the dot still tells the two greens apart.

2. **Pure helpers, counts from the loaded list.** `countByDotColor(clients)` returns `{ all, green, yellow, red }` over the list the sidebar received (before the search), memoised with the list. `visibleClients` = `clients.filter(c => (color === 'all' || dotColorOf(dotStateOf(c)) === color) && clientMatchesQuery(c, query))`.

3. **Markup: a `role="radiogroup"` of four `<button role="radio" aria-checked>`**, class `status-filter`, pressed one gets `is-active`. "הכל" shows the word plus the count; the color buttons show the dot (`status-dot` with the matching class, no pulse) plus the count, and a `title` naming the state ("בתהליך", "הסוכן סיים", "סירבו"). Alternative: native `<select>`; rejected (hides the state, two clicks, no counts at a glance).

4. **Style.** One rounded bar (`display:flex`, border, surface background), buttons `flex:1`, the active one filled with the accent at low opacity and bold text; dot size 8px inside the button. RTL order comes from the document direction; the markup order is "הכל", green, yellow, red.

5. **State in the component**, `useState<DotColor>('all')`, like `clientQuery`. Reset on reload by design (spec).

## Risks / Trade-offs

- [Narrow sidebar on small screens] → four buttons of a word and three numbers fit at 240px; the bar wraps if it must (`flex-wrap`).
- [Counts include deleted clients when the admin toggle is on] → intended: the counts describe the list shown.

## Migration Plan

Web-only; ships with the next deploy. Rollback: revert the commit.
