## Context

See proposal.md — Why. Today `src/agents/shared/mondayStatusSync.ts` writes two fixed labels into one mapped status column (`BoardSourceSchema.statusColumnId`) from four call sites (kickoff webhook, workspace first resume, goal complete in `plan.ts` and `router.ts`, goal reopen in `router.ts`). The dot rule lives in `web/src/format.ts` (`clientDotState`: refused > done > window ended > in progress) and reads three stored facts: `goal_status`, `agent_fields.declined_at`, `agent_fields.overdue_stopped_at`. Every event that changes one of those facts is already a single named function: `markDeclined` (decline routine), `markOverdueStopped` (overdue scan), `updateGoalStatus` (plan/resync), `clearHandedOff` (pause toggle), `setDueDate` (due-date route). The board mapping modal only runs when a board is added; the backend sync is agent-generic, the UI pick is declaration-of-capital only.

## Goals / Non-Goals

**Goals:**
- One place computes the label from the client's stored state, so the column can never disagree with the dot.
- Zero change to the existing status column's behavior.
- No new persistence: the new column id rides in the board source settings like the other ids.

**Non-Goals:**
- Writing the label at import time or for clients the agent never contacted (the board's own pre-start value is the accountant's).
- Retrying failed writes or reconciling the column on a schedule.
- Editing an existing board mapping in place (the modal stays add-only; the accountant re-adds the board once).
- Changing the existing labels (`בטיפול סוכן` / `מסמכים נאספו`).

## Decisions

1. **State-driven write, not event-driven labels.** New function `syncMondayDocumentsStatus(clientId)` in `mondayStatusSync.ts` re-reads the client row, computes the dot state with a backend copy of the rule, and writes the matching label. Callers pass no label. Rationale: the dot has precedence rules (a declined client whose date passes stays red); computing from state after the event makes every call site trivially correct and keeps the precedence in one tested function. Alternative: pass a label per call site like the existing sync — rejected because the resume paths would each have to re-derive the state anyway.

2. **The rule lives in `src/`, the web keeps its copy, a test pins them together.** A pure `documentsStatusLabelOf({ goal_status, declined, overdueStopped })` in a small module (`src/agents/shared/mondayDocumentsStatus.ts`) next to the label constants. `tests/clientDot.test.ts` already imports `web/src/format.js`; a new test iterates all eight flag combinations and asserts the backend label matches `dotColorOf(clientDotState(...))`. Alternative: import `web/src/format.ts` from the backend — rejected, the server build does not include `web/`.

3. **Call sites = the five state-changing functions' callers, after the stored change lands.** Decline: inside `handleClientDeclineWith` after `markDeclined` claimed, as a new injectable dep (`syncDocumentsStatus`) so the existing test harness records the call. Overdue: `overdueScan.ts` after `markOverdueStopped` claimed. Goal complete/reopen: next to the existing `syncMondayStatus` calls in `plan.ts` and `router.ts`. Resume: `workspace.ts` pause toggle after `clearHandedOff` (and in the first-resume branch next to the existing call), `router.ts` due-date route when `wasHandedOff`. Kickoff: `mondayKickoffRoute.ts` next to the existing call. All `void`, fire-and-forget, like today.

4. **Second mapping field, not a title lookup.** `BoardSourceSchema.documentsStatusColumnId` (optional). The modal's `SourceMappingForm` gets a second status select (`documentsStatusOptions`, same option list as the status column) preselected by title `/מסמכים/`. Rationale: consistent with every other column id; a hard-coded Hebrew title would break for a renamed column. Alternative considered: reuse `statusColumnId` and change the labels — rejected by the user (the existing column keeps working as is).

5. **`create_labels_if_missing` stays on.** The four labels already exist on the user's board; on another board a missing label is created rather than failing, same as the existing sync.

## Risks / Trade-offs

- [The accountant must re-add an already-mapped board to pick the new column] → documented in the settings panel wording and in the change summary; re-adding keeps the clients' stored row addresses, so no data is lost.
- [Status-change events fired back at the kickoff webhook by the new writes] → the webhook already ignores status-change events through its startable-state guards (same as the existing sync); nothing new to filter.
- [Token predates `boards:write`] → the write fails and is logged, as today; the accountant reconnects monday once.
- [Two labels written for the same event (kickoff, completion, reopen)] → two sequential monday mutations per event; volume is a handful per client lifetime, acceptable.

## Migration Plan

No database migration. Deploy backend and web together (one image). After deploy the accountant removes and re-adds the board in the agent settings and picks "מסמכים" as the documents status column.

Rollback caution: `BoardSourceSchema` is `.strict()` and `parseSettings` falls back to empty settings when parsing fails, so a plain revert with a stored `documentsStatusColumnId` would make the instance lose **all** its board mappings (every sync and kickoff lookup would see no boards). A rollback must therefore either keep the field in the schema or clear the field from `agent_instances.settings` first. Listed as a task so it is not forgotten.
