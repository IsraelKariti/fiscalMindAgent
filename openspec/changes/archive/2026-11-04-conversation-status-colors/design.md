## Context

See proposal.md for motivation. Current state:

- One pure rule decides the dot: `clientDotState()` in `web/src/format.ts` returns one of four states (`refused`, `done`, `window_ended`, `in_progress`) with precedence refused > done > window ended > in progress. The sidebar and the overview list both call it; the CSS class is the state name.
- The colors live only in `web/src/styles.css`: `.status-dot.in-progress` (yellow `--pending`, pulsing), `.status-dot.done, .status-dot.window-ended` (green `--success`), `.status-dot.refused` (red `--error`).
- The status filter bar folds the four states into three colors through `dotColorOf()` (`DotColor = 'green' | 'yellow' | 'red'`), counts with `countByDotColor()`, and the sidebar lists the buttons in `STATUS_BUTTONS` with hover texts from `t.statusFilterTitles`.
- Hover texts (`dotTitle`) already have four distinct strings, one per state. They do not change.
- No test covers `format.ts` today; the repo's tests are `node --test` files under `tests/` listed in `package.json`.

## Goals / Non-Goals

**Goals:**
- Four states → four colors, one to one, so the filter bar no longer folds states together.
- Keep the one-rule invariant: sidebar and overview list keep calling the same function; no server change.

**Non-Goals:**
- No change to the stat tiles, the header badge, the dashboard's handed-off count or the overview donut (they do not use the dot colors).
- No change to the hover texts or to the state precedence.
- No change to the server's `overdue_stopped` / `declined` flags.

## Decisions

1. **States stay, colors change.** `ClientDotState` and `clientDotState()` are untouched; only the CSS per class and `dotColorOf()` change. `DotColor` becomes `'blue' | 'green' | 'orange' | 'red'` and maps one to one (`in_progress` → blue, `done` → green, `window_ended` → orange, `refused` → red). Alternative: rename the states after their colors. Rejected: the state names say what happened, colors are presentation, and the hover texts key on the states.
2. **Two new CSS tokens**: `--info: #60a5fa` (blue, with `--info-bg`) and `--warning: #fb923c` (orange, with `--warning-bg`), defined next to `--pending` in `:root`. The yellow `--pending` token stays for the scheduled-message styling elsewhere. Alternative: reuse `--accent` (pink) for one of them. Rejected: the accent is the brand color, not a status.
3. **The blue dot keeps the pulse.** The pulse means "the agent is active", which is still what blue means. The `pulse-dot` keyframes use the element's own background, so no color change inside the animation is needed (verify in the browser; if the keyframes hard-code yellow, move the color to a CSS variable on the element).
4. **Five filter buttons**, order "הכל", blue, green, orange, red, matching the proposal. `countByDotColor()` returns all five keys. `statusFilterTitles` gains an `orange` entry and the `green` text drops the "or the due date passed" part. The bar's buttons are `flex: 1 1 0`, so five fit in the sidebar width without CSS changes (check at the narrowest sidebar).
5. **A small test file** `tests/clientDot.test.ts` imports `clientDotState`, `dotColorOf`, `countByDotColor` from `web/src/format.ts` and checks the mapping and precedence. `format.ts` has no React imports, so `node --import tsx --test` can load it (verify; if the file pulls in browser-only code, move the three pure functions to `web/src/clientDot.ts` and import that from `format.ts`).

## Risks / Trade-offs

- [Accountants used to "green = finished" now see orange for a window-ended client] → intended; the hover text still explains it, and the filter bar's button hover text names each color.
- [Blue on the dark theme can be hard to tell from the pink accent on focus rings] → pick a clearly different blue (`#60a5fa`) and check both themes in the browser.
- [Five buttons may wrap in a narrow sidebar] → check in Chrome; if they wrap, reduce the button padding rather than drop a button.

## Migration Plan

Web-only change; deploys with the next push. No data migration and no rollback step beyond reverting the commit.
