## 1. Label rule and sync function

- [x] 1.1 Add `src/agents/shared/mondayDocumentsStatus.ts` with the four label constants and a pure `documentsStatusLabelOf({ goal_status, declined, overdueStopped })` using the dot precedence (refused > done > window ended > in progress); verify with a new `tests/mondayDocumentsStatus.test.ts` that iterates all eight flag combinations and asserts the label matches `dotColorOf(clientDotState(...))` from `web/src/format.ts`.
- [x] 1.2 Add `syncMondayDocumentsStatus(clientId)` to `src/agents/shared/mondayStatusSync.ts`: re-read the client, derive the flags from `goal_status` / `agent_fields.declined_at` / `agent_fields.overdue_stopped_at`, resolve the board's `documentsStatusColumnId`, write the label with `changeItemStatusLabel`, log and swallow every failure; leave `syncMondayStatus` untouched. Verify with `npm run typecheck` and by reading that no existing call site changed.
- [x] 1.3 Extend `BoardSourceSchema` in `src/agents/shared/clientSources.ts` with optional `documentsStatusColumnId`; verify `npm run typecheck` passes and that a settings JSON with the new key still parses (quick node check against `parseSettings`).

## 2. Call sites (one per dot transition)

- [x] 2.1 Kickoff: call the new sync next to the existing one in `src/webhook/mondayKickoffRoute.ts` and in the first-resume branch of the pause route in `src/api/workspace.ts`; verify by reading both sites and `npm run typecheck`.
- [x] 2.2 Goal complete and reopen: call the new sync next to the existing `syncMondayStatus` calls in `src/agents/declarationOfCapital/plan.ts` (`completeGoalIfDone`) and `src/agents/declarationOfCapital/router.ts` (resync, both branches); verify with `npm run typecheck`.
- [x] 2.3 Decline: add an injectable `syncDocumentsStatus` dep to `ClientDeclineDeps` in `clientDeclineRules.ts`, call it right after `markDeclined` claims the client, wire the real function in `clientDecline.ts`; verify `tests/clientDecline.test.ts` records the new call in the claimed case and not in the already-declined case.
- [x] 2.4 Window ended: call the new sync in `src/agents/declarationOfCapital/overdueScan.ts` after `markOverdueStopped` claims the client; verify with `npm run typecheck` and by reading the ordering (after the stop stamp, before the email is awaited is fine since it is fire-and-forget).
- [x] 2.5 Resume: call the new sync in `src/api/workspace.ts` after `clearHandedOff`, and in the due-date route of `router.ts` when `wasHandedOff` is true; verify with `npm run typecheck`.

## 3. Web: second mapping pick

- [x] 3.1 Add the `documentsStatusColumnId` field to `BoardMapping` and `ColumnMapping`, a second status select in `SourceMappingForm.tsx` (same option list as the status column, i18n label `sourcesDocumentsStatusColumn` = "עמודת מסמכים (סטטוס לפי צבע)"), preselected in `BoardMappingModal.tsx` by a status column titled "מסמכים"; verify by `npm run typecheck` and a local board-add in the browser showing both picks.
- [x] 3.2 Show the chosen column in the board's mapping summary line in `ClientSourcesSettings.tsx` after the existing status entry; verify in the browser that a board with the pick lists it and a board without it is unchanged.

## 4. Docs and checks

- [x] 4.1 Update the board status sync paragraph in `docs/agents.md` with the second column, its four labels, the state-driven rule and the re-add note; verify by reading the paragraph.
- [x] 4.2 Add a rollback note to `docs/agents.md` next to the schema mention: a revert must keep `documentsStatusColumnId` tolerated or clear it from `agent_instances.settings` first, because `.strict()` + `parseSettings` fallback drops all boards; verify by reading.
- [x] 4.3 Run `npm test` and `npm run typecheck`; verify both pass.
- [ ] 4.4 Live check (owner): re-add the board in the local agent settings with "מסמכים" as the documents status column, run a kickoff, decline / overdue / resume / complete on a local client and confirm the "מסמכים" column follows the dot while the existing status column keeps its two labels.
