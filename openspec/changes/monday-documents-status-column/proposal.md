## Why

The accountant's monday board has a status column "מסמכים" whose four labels mirror the four colors of the client dot in the workspace (blue, green, red, orange), but today nothing keeps that column in step with the dot. The accountant has to open the workspace to learn whether the agent is still collecting, finished, was refused, or ran out of time. Mirroring the dot's state into that column, every time it changes, puts the answer where the accountant already works.

## What Changes

- A second monday write-back column per board source, the **documents status column**, mapped in the board mapping modal next to the existing status column and shown in the board's mapping summary. It is optional, like the existing one.
- Whenever a client's dot state changes (openspec `client-status-indicator`), the agent writes the matching label to the client's board row in that column:
  - in progress (blue) → `בטיפול סוכן`
  - complete (green) → `הושלם בהצלחה`
  - refused (red) → `סירוב סוכן`
  - window ended (orange) → `הסתיים חלקית`
- The write happens on every transition the dot knows: kickoff (webhook or first resume), goal completion, goal reopening, client decline, overdue stop, and every resume that hands a refused or window-ended client back to the agent (the pause toggle and a new due date).
- The existing status column and its two labels (`בטיפול סוכן` on start, `מסמכים נאספו` on completion) are **unchanged**. The new column is written in addition, never instead.
- Best-effort like the existing sync: a client without a board row, a board without the new mapping, a missing monday connection, or a failed write never blocks the conversation; failures are logged.

## Capabilities

### New Capabilities
- `monday-documents-status`: the documents status column mapping and the rule that mirrors the client dot's state into it.

### Modified Capabilities
- (none — `client-status-indicator` is read, not changed: the new spec reuses its state rule and precedence.)

## Impact

- `src/agents/shared/clientSources.ts` — `BoardSourceSchema` gains `documentsStatusColumnId`.
- `src/agents/shared/mondayStatusSync.ts` — new label set and a state-driven write for the documents column; existing `syncMondayStatus` untouched.
- Transition points: `src/webhook/mondayKickoffRoute.ts`, `src/api/workspace.ts` (pause toggle), `src/agents/declarationOfCapital/router.ts` (resync + due date), `src/agents/declarationOfCapital/plan.ts` (goal complete), `src/agents/declarationOfCapital/clientDeclineRules.ts` (decline), `src/agents/declarationOfCapital/overdueScan.ts` (window ended).
- Web: `BoardMappingModal.tsx`, `SourceMappingForm.tsx`, `ClientSourcesSettings.tsx`, `i18n.tsx` — one more select and one more summary chip.
- `tests/` — a unit test for the label rule (must agree with `clientDotState`) and for the decline routine's new call.
- `docs/agents.md` — the board status sync paragraph gains the second column.
- No migration: the mapping lives in `agent_instances.settings` JSON like the other column ids. Boards already added need to be re-added once to pick the new column (the modal only runs on add).
