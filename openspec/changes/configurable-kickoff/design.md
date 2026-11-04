## Context

See proposal.md for motivation. Current state:

- `AgentTypeDefinition.manualKickoff` (code flag, `src/agents/declarationOfCapital/index.ts`) makes every enrollment path create the client paused: `enrollDeclarationClient` (`kickoff.ts`, `paused: true`, used by the monday kickoff and the admin test form) and the import scan (`clientImportScan.ts`, `paused: manualKickoff`; dead for this type because catalog-seeded types are skipped there).
- The hold itself is derived, not stored: `holdsFirstMessage({ paused, manualKickoff, contactedMessages })` in `src/orchestration/holdRule.ts`. `setFutureEmail` asks `isHeldFirstMessageClient` and, when true, runs the planner in hold mode (draft stored, planned time mirrored in `scheduled_jobs`, no send queued). An unpaused client takes the normal path: draft stored and the send queued.
- `mondayKickoffRoute.ts#isStartable` starts only a client that is `paused`, goal-open, not drafting, with no messages and no `scheduled_jobs` row.
- Per-instance admin settings live as columns on `agent_instances` (never inside the accountant-editable `settings` JSONB, which the workspace PUT replaces wholesale): `tax_year` (042), `review_mode` / `admin_paused` (048), `collection_window_days` (070). Each has a setter in `src/db/queries/agentInstances.ts`, a `POST /api/admin/agent-<thing>` route, a field + capability flag in the admin instance listing (`src/api/admin.ts`), and a row on the admin agent page with an in-app `ConfirmModal`.

## Goals / Non-Goals

**Goals:**
- One boolean column, one admin toggle, and the smallest behavioural change: when the setting is off, the client is simply not paused at enrollment, so every existing unpaused-client path (normal draft + queued send, due date at first delivery, review mode, 24h-window gates) applies unchanged.
- Keep `holdsFirstMessage` pure and unchanged: the hold still means "paused + manual kickoff + never contacted". The setting only decides whether enrollment pauses the client.

**Non-Goals:**
- No change to the activation modal (`AddAgentModal`): the setting is changed after activation on the agent page, and the default (on) is today's behaviour.
- No accountant-facing control, no monday board change, no change to Resume / late-resume rules.
- No bulk change of existing clients when the setting flips.

## Decisions

1. **Column `agent_instances.first_message_approval boolean NOT NULL DEFAULT true`** (migration 073). Named after the existing spec, so "on" reads as today's behaviour. Alternative considered: an `auto_start` flag defaulting to false. Rejected: a negative-of-a-negative reads badly next to the `first-message-approval` spec and the held-draft UI wording.
2. **Enrollment decides the pause.** `enrollDeclarationClient` gets `paused: instance.first_message_approval`; the import scan gets `paused: manualKickoff && instance.first_message_approval` for consistency. A tiny pure helper `enrollsPaused(instance, definition)` in `holdRule.ts` keeps the rule in one place and testable. Alternative: keep enrolling paused and auto-resume right after the draft. Rejected: it would run the hold-mode planner and then the resume path, two code paths for one outcome, and would briefly show the paused note.
3. **`isStartable` drops the `paused` check.** Startable = goal pending, `drafting_since` null, no messages, no `scheduled_jobs` row. The paused flag was only a proxy for "never started"; the remaining checks are the real guards. Side effect worth noting: a never-contacted client whose draft failed for good (unpaused, no job) now gets re-drafted by a repeat kickoff instead of being ignored. That matches the spec's "drafting fails for good" scenarios. Extract the rule into a pure `kickoffStartable({ goalStatus, draftingSince, messages, hasScheduledJob })` in `holdRule.ts` for the test.
4. **Admin route `POST /api/admin/agent-first-message-approval { agentInstanceId, on }`**, admin-only, refusing (400) an instance whose type is not manual-kickoff. Logged like the review-mode route (`logger.info` with the admin id); no audit event, matching the sibling settings.
5. **Admin page row** in the existing supervision card (next to review mode), shown only when `firstMessageApprovalCapable`. Badge when off ("שליחה אוטומטית" style), button opens a `ConfirmModal` whose text says what changes for new clients and that existing clients are untouched. Strings in `web/src/i18n.tsx`.
6. **Pausing an auto-started client before its first send** is left to the existing rules: the client becomes paused + manual kickoff + never contacted, so it is a held first message and Resume sends the preserved draft. No special case needed; the spec scenario documents it.

## Risks / Trade-offs

- [Repeat kickoff on a client whose first draft failed now re-drafts] → intended; the draft-failed notice already offers a retry, and the kickoff is the accountant's own click.
- [Setting off + review mode on] → the first message still waits in the admin review queue; the setting only removes the accountant's Resume step. Document this in the modal text.
- [Production must run migration 073 before the new code reads the column] → the deploy flow runs migrations first, as for 070.
- [Import scan path is dead for this type] → the one-line change there is for consistency only; no behaviour to verify.

## Migration Plan

1. Add migration `073_agent_instance_first_message_approval.sql`; run `npm run db:migrate` locally.
2. Deploy: production runs migrations during deploy; existing instances get `true`, so nothing changes until an admin flips a switch.
3. Rollback: revert the code; the column may stay (unused, default true).
