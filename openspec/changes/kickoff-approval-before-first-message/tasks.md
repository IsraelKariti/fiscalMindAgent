## 1. Held draft (paused, nothing queued)

- [x] 1.1 Add the `hold` option to `scheduleDraftMessage` (`src/orchestration/scheduleDraftEmail.ts`): insert the draft, upsert the `scheduled_jobs` row with the deterministic job id and the planned time, skip the BullMQ enqueue; verify with a unit test that the queue add is not called and the row carries the planned time.
- [x] 1.2 Add the hold path to `setFutureEmail` (`src/orchestration/setFutureEmail.ts`): a paused client whose agent type is manual-kickoff and that has no messages runs the planner with a `hold` hint instead of returning early; the declaration-of-capital planner's scheduling step forwards the hint to `scheduleDraftMessage`; verify with a unit test that a paused client with messages still returns early and a paused never-contacted one drafts without queuing.
- [x] 1.3 Rewire `src/webhook/mondayKickoffRoute.ts`: `startConversation` keeps the audit + publish but no longer unpauses; `isStartable` also requires no `scheduled_jobs` row and no `drafting_since` stamp; verify with a unit test that after a kickoff the client is still paused and a second fire is ignored.
- [x] 1.4 Confirm the inbound re-plan keeps the hold: `replanWorker` is unchanged (remove + `setFutureEmail`), and `setFutureEmail` derives hold mode from the pure rule covered by `tests/firstMessageHold.test.ts` (no DB-mocking harness exists; the DB-bound flow is part of the live check in 2.3).

## 2. Resume sends the preserved draft

- [x] 2.1 Extract the "re-enqueue the mirrored job now" branch of `sendFutureEmailNow` into a shared helper (`src/orchestration/enqueuePreservedSendNow.ts` or a local export) and use it from both places; verify `npm test` still passes for send-now.
- [x] 2.2 Change `resumeFutureEmail` (`src/orchestration/resumeFutureEmail.ts`): when the preserved row's time has passed and the job id parses, enqueue the same draft now instead of redrafting; keep the fresh plan only for no row / unparseable or squatted job id; verify with unit tests for the three branches (time ahead → restored with delay; time passed → same job id, no delay, `scheduled_for = now`; no row → planner called).
- [ ] 2.3 Verify end to end on the dev stack (`/verify` skill): kickoff a paused test client, see the held bubble, resume after the planned time passed, see the same WhatsApp template send in the worker log and the client unpaused.

## 3. Workspace warning modal

- [x] 3.1 Add Hebrew strings to `web/src/i18n.tsx`: modal title, body ("the planned time has passed; the message will be sent immediately when you resume"), confirm and cancel labels; verify `npm run typecheck`.
- [x] 3.2 In `web/src/components/Timeline.tsx`, make the Resume click check `nextScheduled.scheduledFor <= now` at click time; when past, open the in-app `ConfirmModal` and call the pause toggle only on confirm (cancel leaves the client paused); no browser dialogs; built and typechecked — the browser check (future-time resume shows no modal, past-time shows it, cancel keeps the paused bubble, confirm sends) is left to the owner with 2.3/3.3.
- [ ] 3.3 Verify both Resume buttons (the scheduled bubble's and the no-draft paused notice's) behave correctly: the no-draft notice never shows the modal.

## 4. Docs and wrap-up

- [x] 4.1 Update `docs/pipeline.md` section C (kickoff rows: "keep paused, audit", "first draft held", "resume: restore / send now / redraft" naming each function) and the manual-kickoff paragraph in `docs/agents.md`; verify the tables list every new or changed function.
- [x] 4.2 Run `npm test` and `npm run typecheck`; verify both pass.
- [x] 4.3 Commit per the repo git workflow (pull --rebase, typecheck, push); verify the push landed on `origin/master`.
