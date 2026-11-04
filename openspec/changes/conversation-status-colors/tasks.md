## 1. Color rule

- [x] 1.1 In `web/src/format.ts` change `DotColor` to `'blue' | 'green' | 'orange' | 'red'`, map each state to its own color in `dotColorOf()` (`in_progress` → blue, `done` → green, `window_ended` → orange, `refused` → red), give `countByDotColor()` the five keys, and update the doc comments on `clientDotState` / `dotColorOf` (no more "two greens fold together"); verify `npm run typecheck` passes
- [x] 1.2 Add `tests/clientDot.test.ts` (state precedence: refused > done > window ended > in progress; the four color mappings; counts for a mixed list) and add it to the `npm test` list in `package.json`; verify `npm test` passes (if `format.ts` cannot load under node, move the three pure functions to `web/src/clientDot.ts` as the design says)

## 2. Styles

- [x] 2.1 In `web/src/styles.css` add `--info` / `--info-bg` (blue) and `--warning` / `--warning-bg` (orange) tokens next to `--pending`, make `.status-dot.in-progress` blue (keeping the pulse), `.status-dot.window-ended` orange with its own glow, leave `.status-dot.done` green and `.status-dot.refused` red, and update the comment block; verify in Chrome that a client of each state shows the right color in the sidebar and the overview list, and that the blue dot still pulses

## 3. Status filter bar

- [x] 3.1 In `web/src/components/Sidebar.tsx` change `STATUS_BUTTONS` to five entries in the order all, blue (`in-progress`), green (`done`), orange (`window-ended`), red (`refused`); in `web/src/i18n.tsx` type `statusFilterTitles` with the new keys, add the orange hover text (due date passed, documents missing) and shorten the green one to "all documents received"; verify typecheck passes and in Chrome the bar shows five buttons with correct counts, pressing orange lists only window-ended clients, and the buttons do not wrap at the narrowest sidebar width (reduce padding if they do)

## 4. Docs and finish

- [x] 4.1 Update the spec comment references if any file comment still says "three colors" or "yellow" for the dot (`grep -rn "yellow\|three colors" web/src`); verify the grep finds no dot-related hit
- [x] 4.2 Run `npm run typecheck` and `npm test`, then commit per the repo git workflow (pull --rebase, commit, push)

## 5. Owner browser check

- [ ] 5.1 In Chrome (Claude's browser tools were not connected on 2026-11-04): confirm each dot state shows its color in the sidebar and the overview list, the blue dot pulses, the filter bar shows five buttons with correct counts, pressing orange lists only window-ended clients, and the buttons do not wrap at the narrowest sidebar width
