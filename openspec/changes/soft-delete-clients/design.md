## Context

See proposal.md — Why. What shapes the approach:

- `clients` is the parent of `emails`, `client_documents`, `document_files`, `scheduled_jobs`, `client_portal_credentials` and `tax_fetch_sessions` through `ON DELETE CASCADE`; `audit_events.client_id` is `ON DELETE SET NULL`; `llm_calls.client_id` has no foreign key. Identity is two partial-free unique indexes per instance: `clients_instance_email_address_key (agent_instance_id, lower(email_address))` and `clients_instance_wa_phone_key (agent_instance_id, wa_phone) WHERE wa_phone IS NOT NULL` (migration 019). `clients.insert` retries without the phone on a `wa_phone` collision.
- All client reads go through `src/db/queries/clients.ts` (plus `dashboard.ts` summaries, `agentInstances.listAllWithClientCounts`, and display joins in `emails.ts`, `llmCalls.ts`, `auditEvents.ts`). The lookups that drive work are `getByWaPhoneForInstance` (inbound WhatsApp, kickoff, import scan, add form), `getByEmailAddressForInstance` (same for email agents), `listForInstance` / `listForUser` (roster, review-mode unpause re-plan, admin client list), `listOverdueForAgentTypes`, `listDraftingWithoutSchedule`, and the by-id reads `getById` (workers, planner re-read, admin modals) and `getByIdForInstance` (every workspace route).
- The delete route `DELETE /api/workspace/clients/:id` cancels the pending send under the client lock, snapshots blob keys, hard-deletes, publishes the roster tick, then deletes blobs. Account deletion (`src/api/admin.ts`) deletes the user row and relies on the cascade.
- Admin view-as: `requireAuth` sets `req.userId` (effective) and `req.realUserId` (signed-in); they differ exactly while an admin views as an accountant. The web client sends `X-FM-View-As`; the session response carries `impersonating`.
- Workers that re-read the client already stop on `null` (`sendEmailWorker`, `plan.ts` fresh read, `analyzeStoredFile`); `resyncScheduledJobs` uses `client?.paused` and would re-queue on `null`.

## Goals / Non-Goals

**Goals:**
- One place decides what "live" means; no caller rebuilds the predicate.
- A deleted row is invisible to everything that acts, and readable only to the admin.
- Re-adding is the normal insert path, with no special case.

**Non-Goals:**
- Undelete, retention / purge of deleted clients, monday write-back for deleted clients, changes to account deletion.
- Hiding deleted clients from the LLM call browser or the audit page (those list by call / event and name the client; a deleted client's name still shows).

## Decisions

**1. Soft-delete columns, not an archive table.** `clients.deleted_at TIMESTAMPTZ NULL` and `deleted_by UUID NULL REFERENCES users(id) ON DELETE SET NULL`. Alternative: copy the row and its children to `deleted_clients*` tables and hard-delete. Rejected: every child table would need a mirror and every admin reader two code paths; the foreign keys from `llm_calls`, `audit_events` and step links would still dangle.

**2. Partial unique indexes carry the identity rule.** Migration 063 drops and recreates both indexes with `WHERE deleted_at IS NULL` (the phone one keeps `AND wa_phone IS NOT NULL`). The database, not the lookups, guarantees "no two live clients share an email / phone", so a missed filter in a lookup can at worst show a stale row, never create a duplicate. `insert()` is unchanged: its collision retry keeps working because the index name is the same. A supporting index `clients_instance_deleted_idx (agent_instance_id, deleted_at DESC) WHERE deleted_at IS NOT NULL` serves the admin list.

**3. Live-by-default in the queries module.** A module-level `const LIVE = 'deleted_at IS NULL'` is appended to every query in `clients.ts` except the explicit any-row readers. `getById` becomes live-only: that is what every worker and the planner want, and it makes "work in flight stops" hold without touching each caller. New readers for the admin: `getAnyById(id)` (modals that display a client by id: `llmAdmin` call detail, `reviewAdmin` targets, the step/call modals' client lookups) and `listDeletedForInstance(agentInstanceId)`. `getByIdForInstance(id, instanceId, { includeDeleted?: boolean })` serves the workspace read routes. Alternative: a database view `live_clients`. Rejected: `SELECT *` call sites and `RETURNING *` updates would split between table and view; a string predicate is simpler and greppable.

**4. Dashboard and counts filter in SQL.** `dashboard.listClientSummaries` (both variants) and `agentInstances.listAllWithClientCounts` add `c.deleted_at IS NULL`. Display joins (`emails.ts`, `llmCalls.ts`, `auditEvents.ts`) stay unfiltered: they decorate a row that already exists with the client's name.

**5. Delete = mark + cancel + audit, no blob cleanup.** `markDeleted(id, agentInstanceId, actorUserId)` is `UPDATE clients SET deleted_at = now(), deleted_by = $3 WHERE id = $1 AND agent_instance_id = $2 AND deleted_at IS NULL RETURNING id`; zero rows means "not found" (also covers the double delete). The route keeps `withClientLock(removeFutureEmail)` first, then marks, then `publishInstanceClientsUpdated`, then `recordAudit({ action: 'client.deleted', actorType: 'user', actorUserId: req.realUserId, agentInstanceId, clientId })`. The blob snapshot and `deleteBlob` loop are removed. `removeForUser` / `removeForInstance` are deleted (no other caller).

**6. In-flight work: one explicit check where `null` is not already terminal.** `resyncScheduledJobs`: `if (!client || client.paused) return`. `replanWorker`, `taxFetchWorker`, `closingMessage`, `notifyAccountant` are audited during implementation for a by-id read whose `null` branch continues; each gets a `return` with a log line. The pending `replan-<clientId>` BullMQ job is left in place: it fires, finds no live client and ends (cheaper than a cross-process cancel).

**7. Admin-only visibility through the existing view-as signal.** The workspace list route accepts `?deleted=1`; it answers `403` unless `req.realUserId !== req.userId` (an admin viewing as). The per-client read routes (`GET /clients/:id`, thread, documents, files, trace, file streaming, step and call modals) load with `includeDeleted: isViewingAs(req)`; every write route loads live-only and so answers `404` for a deleted client. `toWorkspaceClient` adds `deletedAt` and `deletedBy` (name of the acting user, resolved in the list route for the deleted list only). Alternative: a separate admin page under `#/admin`. Rejected: the admin already has the whole workspace under view-as, and the existing modals (documents, trace, step, call) work there unchanged.

**8. Web.** `Sidebar` shows a "deleted clients" toggle only when the session carries `impersonating`; on, it fetches `?deleted=1` (background: true — timer-driven refreshes must not keep the view-as session alive) and lists deletion dates. `ClientView` for a client with `deletedAt` renders a banner and passes `readOnly` to the message composer, the header actions, `DocumentsCard` and the WhatsApp card so no action control renders. `DeleteClientModal` text changes to the kept-data wording. A deleted client opened by an accountant (no `impersonating`) hits the live-only route and gets the existing "client not found" state.

**9. Audit action.** `client.deleted` joins `AuditAction`; `adminAudit` / the audit page need no change (actions are free-form strings there).

## Risks / Trade-offs

- [A lookup outside `clients.ts` misses the filter] → the partial unique indexes stop duplicates; the implementation task greps `FROM clients` / `JOIN clients` and lists each site in the task log.
- [Storage grows: deleted clients' blobs are never freed] → accepted; a retention change can add a purge job later, and this change leaves `document_files` rows intact so such a job has the keys.
- [A deleted client's `monday_item_id` still points at a board row that now belongs to the new client] → the status sync only runs on events of live clients; the deleted row's fields are inert.
- [A tax-fetch session row of the deleted client keeps the one-active partial index busy for that client id] → the new client has a new id, so no collision; the stale session is finished by the worker's live read returning `null`.
- [Admin sees a deleted client's name in the call browser without knowing it is deleted] → accepted for this change; `getAnyById` returns `deleted_at`, so a later change can badge it.

## Migration Plan

1. Apply migration 063 (`npm run db:migrate` locally; production runs migrations in the deploy flow). The migration is additive plus two index swaps; existing rows get `deleted_at = NULL` and stay live.
2. Deploy code. Rollback: the old code ignores the new columns, so every soft-deleted row is live again for it (listed, routed, re-planned). A rollback must first hard-delete the rows with `deleted_at` set; the partial indexes can stay (they still enforce uniqueness among the remaining rows).

## Open Questions

None.
