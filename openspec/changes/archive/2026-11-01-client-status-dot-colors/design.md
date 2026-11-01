## Context

- Two dots exist: `Sidebar.tsx` (`dotFor`: `overdue` when `isOverdueStopped`, else the goal status) and `Overview.tsx` (`overdue` when `overdue_stopped || declined`, else the goal status; titles `goalDeclinedTitle` / `goalOverdueTitle` / `goalCompleteTitle` / `goalPendingTitle`). CSS classes in `styles.css`: `.status-dot.pending` (yellow, pulsing), `.complete` (green, glow), `.overdue` (red, glow), `.wa-muted` (red, unused by any component).
- The sidebar has the full client row (`agent_fields.overdue_stopped_at` / `declined_at`, `goal_status`); the overview has the dashboard summary row (`overdue_stopped`, `declined`, `goal_status`, from `dashboard.ts`). Both already carry everything the rule needs.
- The not-yet-archived `client-decline` delta says the overview uses "the same handed-off styling as an overdue stop"; this change gives the refusal its own color.

## Goals / Non-Goals

**Goals:**
- One pure function decides the dot state for both lists, so the two can never drift again.
- Window-ended = green, refused = red, everything else yellow; hover text keeps the two greens apart.

**Non-Goals:**
- The header badge, the stat tiles and the timeline notices keep their wording and colors (the badge stays red-ish "danger" for both handed-off states; it has words).
- The overview donut and its counts.
- Any server change.

## Decisions

1. **A shared state function in `web/src/format.ts`.** `clientDotState(client: { goal_status; overdueStopped: boolean; declined: boolean }): 'done' | 'window_ended' | 'refused' | 'in_progress'`, with the precedence refused > done > window_ended > in_progress. Sidebar feeds it `isOverdueStopped(client)` / `isDeclined(client)`; Overview feeds it the summary booleans. Alternative: keep two inline expressions; rejected, that is how the sidebar missed the decline.

2. **CSS classes named by state, not by color.** `.status-dot.done` and `.status-dot.window-ended` (both green, same rule, the second without the pulse), `.status-dot.refused` (red), `.status-dot.in-progress` (yellow, pulsing). The old `pending` / `complete` / `overdue` / `wa-muted` classes are removed. Alternative: reuse `complete` for both greens; rejected, a state-named class lets a later change restyle one without touching the other.

3. **Hover text per state.** Four i18n keys: `dotDone` ("כל המסמכים התקבלו"), `dotWindowEnded` ("תאריך היעד עבר — התיק בטיפולך"), `dotRefused` ("הלקוח סירב — התיק בטיפולך"), `dotInProgress` ("איסוף בתהליך"). The existing `goal*Title` keys are replaced where they served the dots only.

4. **Unit test on the pure function**, in `web/` there is no test runner; the function lives in `web/src/format.ts`, which the server test runner cannot import. Decision: keep the function trivially small and verify through the TypeScript compiler plus a browser check; no new test harness for one function.

## Risks / Trade-offs

- [Green for "window ended" hides the still-missing documents at a glance] → the hover text and the red header badge on the client page say it; accepted by the owner (plain green chosen over a ring).
- [Overview `declined` column missing for an old API response] → `clientDotState` treats `undefined` as false.

## Migration Plan

Web-only; ships with the next deploy. Rollback: revert the commit.
