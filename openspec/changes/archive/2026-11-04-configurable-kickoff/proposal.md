## Why

Every new declaration-of-capital client starts paused: the kickoff drafts the first message and holds it until the accountant clicks Resume. This is a fixed code flag of the agent type (`manualKickoff`), so an accountant who trusts the agent and wants the first message to go out by itself has no way to turn the hold off. The hold should be a per-agent-instance setting that the admin can switch, with today's behaviour as the default.

## What Changes

- A new per-instance setting, **first-message approval** (on by default), shown on the admin's agent page for manual-kickoff agent types only.
- When the setting is **on** (default): everything stays as today. The kickoff (monday webhook or admin test form) creates the client paused, drafts the first message and holds it; Resume sends it.
- When the setting is **off**: the kickoff creates the client **not paused**, drafts the first message and queues it for its planned time. No Resume is needed. The client shows in the list as a running client with a scheduled message, exactly like a resumed one.
- Switching the setting affects only clients enrolled after the switch. Clients already holding a first draft keep it, and clients already running keep running.
- The admin changes the setting through an in-app confirm modal (no browser dialog), like the review-mode toggle. The accountant's workspace does not show the setting.
- The monday kickoff no longer requires the client to be paused in order to start it; it starts any never-contacted client that has no stored or in-flight draft. (Today the paused flag stands in for "never started"; the message and draft checks already cover that.)

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `first-message-approval`: the hold becomes conditional on a per-instance setting; adds the requirement that each manual-kickoff instance carries that setting and that the admin can change it on the agent page.
- `admin-test-client`: the test client is created paused with a held draft only when the instance's first-message approval is on; otherwise it starts right away like a kickoff client.

## Impact

- Database: one migration adding `first_message_approval boolean NOT NULL DEFAULT true` to `agent_instances` (production needs it on deploy).
- Server: `src/agents/declarationOfCapital/kickoff.ts` (enrollment pause flag), `src/agents/shared/clientImportScan.ts` (same flag), `src/webhook/mondayKickoffRoute.ts` (startable rule), `src/db/queries/agentInstances.ts` + `src/db/types.ts` (column + setter), `src/api/admin.ts` + `src/api/router.ts` (instance listing field + toggle route).
- Web: `web/src/api.ts` (field + call), `web/src/components/admin/AgentPage.tsx` (toggle row + confirm modal), `web/src/i18n.tsx` (Hebrew strings).
- Docs: `docs/agents.md` manual-kickoff paragraph, `docs/pipeline.md` kickoff rows.
- Tests: `tests/firstMessageHold.test.ts` gains cases for the extracted startable rule and the enrollment pause decision.
