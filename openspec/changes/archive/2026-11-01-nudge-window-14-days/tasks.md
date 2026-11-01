## 1. Database and instance model

- [x] 1.1 Add `migrations/070_agent_instance_collection_window.sql`: `ALTER TABLE agent_instances ADD COLUMN collection_window_days integer NOT NULL DEFAULT 14 CHECK (collection_window_days BETWEEN 1 AND 365)`; run `npm run db:migrate` and verify the column exists with value 14 on the local instances (`docker psql`).
- [x] 1.2 Add `collection_window_days: number` to `AgentInstanceRow` (`src/db/types.ts`) and `agentInstances.setCollectionWindowDays(id, days)` (`src/db/queries/agentInstances.ts`); verify `npm run typecheck` passes.

## 2. First contact stamps the due date

- [x] 2.1 Create `src/agents/declarationOfCapital/collectionWindow.ts` with `dueDateFromWindow(sentAt, days)` (local date in `ACCOUNTANT_TIMEZONE` plus days, "YYYY-MM-DD", date arithmetic on the parts) and `startCollectionWindow(client, instance, sentAt)` that runs a conditional UPDATE setting `agent_fields.due_date` only when absent; verify with a unit test in `tests/collectionWindow.test.ts` covering: 23:30 Israel time counts from the local date, 14 days added across a month end, and an existing due date is left untouched.
- [x] 2.2 Add the optional hook `onFirstContact?(ctx: AgentContext, sentAt: Date): Promise<void>` to `AgentTypeDefinition` (`src/agents/types.ts`), implement it on the declaration-of-capital definition by calling `startCollectionWindow`; verify `npm run typecheck`.
- [x] 2.3 In `src/queue/sendEmailWorker.ts`, read `emails.hasDeliveredOutbound(clientId)` before the send and, after a successful `markSent` when it was false, call the agent type's `onFirstContact` (errors logged, never failing the send); verify by running the dev stack: add a client with no due date, let the first message go out (mock/sandbox send), and check the client row now carries `due_date` = today + 14 and the workspace chip shows it.
- [x] 2.4 Verify the override and once-only rules on the running stack: a client added with a hand-set due date keeps it after first contact; clearing the due date after first contact and sending another message leaves it cleared.

## 3. Admin surface

- [x] 3.1 Add `collectionWindowDays` to the admin agents payload in `src/api/admin.ts` (the instances list) and the route `POST /api/admin/agent-collection-window { agentInstanceId, days }` (Zod int 1..365, 404 on unknown instance, logs `agent collection window set`); register it next to `adminSetAgentTaxYear`; verify with curl: 21 is stored, 0 and 400 are refused with 400.
- [x] 3.2 Add `api.adminSetAgentCollectionWindow` and the `collectionWindowDays` field to `web/src/api.ts`; add a "collection window" card to `web/src/components/admin/AgentPage.tsx` (number input, save enabled only on change, same `run(...)` error handling as the tax-year card) with Hebrew strings in `web/src/i18n.tsx`; verify in the browser: the card shows 14, saving 21 persists after reload.

## 4. Docs and pipeline

- [x] 4.1 Update `docs/agents.md` "Collection lifecycle (completion & due date)" with the window (column, default, admin route, first-contact stamp, no backfill) and `docs/pipeline.md` with the new junction (`sendEmailWorker` first contact → `DOC/collectionWindow.ts` · `startCollectionWindow`); verify both files mention `collection_window_days`.
- [x] 4.2 Document `.env.example` only if a new env var was introduced (none expected); verify `npm run typecheck` and `npm test` pass, then commit and push per the Git workflow.

## 5. End-to-end check

- [x] 5.1 On the dev stack set a client's stamped due date to yesterday (through the header edit), run the overdue scan (worker boot catch-up or the BullMQ job), and verify: the client is paused and shows handed off, the scheduled send is cancelled, the accountant email step appears on the trace, and a later inbound message is stored with no reply.

Live checks 2.3, 2.4, 3.2 and 5.1 were left to the owner, who asked to archive.
