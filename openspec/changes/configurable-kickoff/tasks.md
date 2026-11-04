## 1. Database and types

- [x] 1.1 Add `migrations/073_agent_instance_first_message_approval.sql` adding `first_message_approval boolean NOT NULL DEFAULT true` to `agent_instances` with a header comment (why a column, not settings JSONB); run `npm run db:migrate` and verify the column exists via docker psql `\d agent_instances`
- [x] 1.2 Add `first_message_approval: boolean` to `AgentInstanceRow` in `src/db/types.ts` and a `setFirstMessageApproval(id, on)` setter in `src/db/queries/agentInstances.ts`; verify `npm run typecheck` passes

## 2. Enrollment and kickoff rules

- [x] 2.1 Add pure helpers `enrollsPaused({ manualKickoff, firstMessageApproval })` and `kickoffStartable({ goalStatus, draftingSince, messages, hasScheduledJob })` to `src/orchestration/holdRule.ts`; add cases to `tests/firstMessageHold.test.ts` (paused only when manual kickoff AND approval on; startable regardless of paused, not when drafting / has messages / has a job) and verify `npm test` passes
- [x] 2.2 Use `enrollsPaused` in `enrollDeclarationClient` (`src/agents/declarationOfCapital/kickoff.ts`) and in the import scan insert (`src/agents/shared/clientImportScan.ts`); update the doc comments that say the client is always created paused; verify typecheck passes
- [x] 2.3 Replace the body of `isStartable` in `src/webhook/mondayKickoffRoute.ts` with `kickoffStartable` (no `paused` check) and update its comment and the `draftFirstEmail` comment (hold mode only when approval is on); verify typecheck passes
- [x] 2.4 Update the comment in `src/agents/declarationOfCapital/testClient.ts` (held only when approval is on); verify that creating a test client on an instance with approval off produces an unpaused client whose first draft is queued (check `scheduled_jobs` row + no paused note in the workspace)

## 3. Admin API

- [x] 3.1 In `src/api/admin.ts` add `firstMessageApprovalCapable: Boolean(def.manualKickoff)` and `firstMessageApproval: i.first_message_approval` to the instance listing (both the per-accountant and the type-info shape where the sibling flags appear); verify `GET /api/admin/accountants` JSON shows both fields
- [x] 3.2 Add `adminSetAgentFirstMessageApproval` (schema `{ agentInstanceId: uuid, on: boolean }`, 400 when the type is not manual-kickoff, `logger.info` with the admin id) in `src/api/admin.ts` and mount `POST /admin/agent-first-message-approval` behind `requireAdmin` in `src/api/router.ts`; verify with a `fetch` from the admin's browser session that the response echoes the new value and a second GET shows it

## 4. Admin UI

- [x] 4.1 Add `firstMessageApprovalCapable` / `firstMessageApproval` to the instance type and an `adminSetAgentFirstMessageApproval` call in `web/src/api.ts`; verify typecheck passes
- [x] 4.2 Add Hebrew strings to `web/src/i18n.tsx` (label, description that says it applies to new clients only and that review mode still holds messages, off-badge, enable/disable buttons, two confirm texts, save-failed) ; verify typecheck passes
- [x] 4.3 Add a row to the supervision card in `web/src/components/admin/AgentPage.tsx`, shown only when capable, with a `ConfirmModal` (no browser dialog) that calls the API and refreshes the instance; verify in Chrome: the row shows on the declaration-of-capital agent page, flipping it updates the badge after confirm, and it is absent on the accountant's workspace settings

## 5. Docs and end-to-end check

- [x] 5.1 Update `docs/agents.md` (manual-kickoff paragraph: the pause and hold depend on the instance setting) and `docs/pipeline.md` (kickoff / first-draft rows); verify the text names the setting and the new helpers
- [ ] 5.2 Live check with approval off: create a test client from the admin "בדיקה" tab and verify the client appears unpaused, the timeline shows the first draft as scheduled with no Resume button, and (if the planned time is reached) the message is sent without any click; then turn approval back on and verify a new test client is held as before
- [ ] 5.3 Run `npm run typecheck` and `npm test`, commit per the repo git workflow, and note in the commit message that production needs migration 073
