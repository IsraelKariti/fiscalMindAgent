## Why

Today the agent keeps sending reminders to a silent client for as long as the client stays pending: the prompt only spaces reminders out (3 days, then a week, then two) and nothing ever ends the chase unless the accountant typed a collection due date by hand on that client. The accountant wants every conversation to last a fixed time (14 days) and the agent to stop nudging after that, without setting a date on each client.

## What Changes

- Each agent instance gets a **collection window** in days, admin-set on the agent's admin page, default 14.
- When the agent's first message to a client is delivered, the client's collection due date is set automatically to the delivery date plus the window, unless the accountant already set a due date on that client. The date shows in the existing due-date chip and stays editable.
- The existing due-date behaviour then does the rest: the planner sees the deadline and paces reminders toward it; the night after the due date the overdue scan pauses the client, emails the accountant the missing list, and marks the client "handed off". No new stop mechanism.
- Clients contacted before this change and with no due date are not touched (no backfill).

## Capabilities

### New Capabilities
- `collection-window`: the per-agent collection window, the automatic due date at first contact, and what "the window ended" means for the client and the accountant (the pre-existing due-date / overdue behaviour is written down here as the contract it now serves).

### Modified Capabilities
- (none — no existing spec describes the due date or the overdue scan)

## Impact

- Database: migration 070 adds `agent_instances.collection_window_days` (integer, default 14).
- Server: admin agents payload + one admin route to set the window (`src/api/admin.ts`, `src/db/queries/agentInstances.ts`); a first-contact hook on the agent type (`src/agents/types.ts`, `src/queue/sendEmailWorker.ts`); the declaration-of-capital implementation that stamps the due date (`src/agents/declarationOfCapital/collectionWindow.ts`, new).
- Web: admin agent page gets a "collection window" card (`web/src/components/admin/AgentPage.tsx`, `web/src/api.ts`, `web/src/i18n.tsx`).
- Docs: `docs/agents.md` (collection lifecycle), `docs/pipeline.md` (new named junction).
- Production needs migration 070 (and still 062-069).
