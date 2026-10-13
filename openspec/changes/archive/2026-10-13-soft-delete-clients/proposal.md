## Why

Deleting a client today is a hard `DELETE FROM clients`: the row and, through the foreign-key cascades, the client's messages, documents, files, tax-fetch sessions and portal credentials disappear, and the blob files are wiped afterwards (`DELETE /api/workspace/clients/:id`). Only the LLM call log and the token counters survive, and the audit rows lose their client link. The accountant then has no record that the client ever existed, no way to look at what was collected, and no trace behind the remaining call-log rows. At the same time a client is identified by email / WhatsApp phone per agent instance (`clients_instance_email_address_key`, `clients_instance_wa_phone_key`), so the same person can never exist twice — which is exactly what re-adding a deleted client should produce: a brand-new client, with a new id and an empty history, while the old record stays.

## What Changes

- **Deleting a client keeps the row.** The delete action marks the client deleted (`clients.deleted_at`, `deleted_by`) instead of removing it. Messages, documents, files, blob objects, tax-fetch sessions, LLM calls and audit links all stay. Nothing is wiped from blob storage on delete any more. **BREAKING** for the accountant-facing promise: the delete modal no longer says the data is erased.
- **A deleted client is out of the roster.** Every lookup that drives work — the workspace list, the per-client routes, inbound WhatsApp routing, the monday kickoff, the daily import scan, the add-client form, the overdue scan, the drafting resync, the dashboard counts, the admin client counts — sees live clients only. A deleted client receives no messages, is not re-planned, and its pending send is cancelled as today.
- **The same email / phone may be added again, as a new client.** Uniqueness of email and WhatsApp phone per agent instance applies to live clients only (partial unique indexes). A new client with the address or number of a deleted one gets a new id, an empty history and its own engagement; the deleted record is not revived. Two live clients still cannot share an email or a phone.
- **Work in flight stops.** A planner run, a send job, a tax fetch or a re-plan that re-reads its client after the delete finds no live client and stops, instead of acting on the deleted row.
- **The admin can still see deleted clients.** While viewing as an accountant, the admin's sidebar gains a "deleted clients" toggle: deleted clients are listed with their deletion date, open read-only (thread, documents, files, trace), and carry a "deleted on …" banner. Accountants never see deleted clients. Writes to a deleted client (rename, pause, WhatsApp toggle, document actions, kickoff, resume) are refused.
- **Delete is audited.** A `client.deleted` audit event with the acting user (the admin while viewing as, otherwise the accountant), the agent instance and the client. Account deletion (the user's own account) still erases everything, as today.

Out of scope: a retention rule for deleted clients' personal data (a later change), undelete, and any monday write-back for deleted clients.

## Capabilities

### New Capabilities

- `client-lifecycle`: how a client is created, which identity rule applies (email / WhatsApp phone, live clients only), what deleting a client does and keeps, how deleted clients behave for routing, work in flight and re-adding, and how the admin sees them.

### Modified Capabilities

- `conversation-trace`: the "file no longer exists" scenarios no longer arise from deleting a client; they stay for files removed on their own (split cleanup, blob failure). Wording only.

## Impact

- `migrations/063_clients_soft_delete.sql` — `deleted_at TIMESTAMPTZ`, `deleted_by UUID REFERENCES users ON DELETE SET NULL`; the two unique indexes recreated with `WHERE deleted_at IS NULL`; a partial index on `(agent_instance_id, deleted_at)` for the admin list.
- `src/db/queries/clients.ts` — a single `LIVE` predicate on every roster/lookup query; `getById` becomes live-only; `getAnyById` / `getByIdForInstance(…, { includeDeleted })` / `listDeletedForInstance` for the admin views; `markDeleted` replaces `removeForInstance` / `removeForUser`.
- `src/db/queries/dashboard.ts`, `agentInstances.ts` (client counts), `clients.ts` overdue / drafting scans — live filter.
- `src/api/workspace.ts` — the delete route (mark + cancel send + audit, no blob cleanup); `?deleted=1` list for admin view-as; read routes accept a deleted client only for an admin viewing as; write routes refuse it. `src/api/workspaceSerialize.ts` — `deletedAt` on the client shape.
- `src/api/llmAdmin.ts`, `reviewAdmin.ts`, `src/agents/declarationOfCapital/router.ts` — by-id reads that display a client switch to `getAnyById`; work paths keep the live read.
- `src/queue/resyncScheduledJobs.ts`, `sendEmailWorker.ts`, `replanWorker.ts`, `taxFetchWorker.ts`, `src/agents/declarationOfCapital/plan.ts` — a missing live client ends the job (most already do; resync needs an explicit check).
- `src/audit/audit.ts` — `client.deleted`.
- `web/src/components/Workspace.tsx`, `Sidebar.tsx`, `ClientView.tsx`, `DeleteClientModal.tsx`, `i18n.tsx`, `api.ts` — deleted toggle (admin view-as only), read-only client view with banner, new modal wording.
- `docs/agents.md` (client identity + delete), `tests/` (identity rule + delete route unit tests).
- Production and the local DB need migration 063. Rows deleted before this change are gone and cannot be recovered.
