## 1. Database

- [x] 1.1 Add `migrations/063_clients_soft_delete.sql`: `deleted_at TIMESTAMPTZ`, `deleted_by UUID REFERENCES users(id) ON DELETE SET NULL`; drop and recreate `clients_instance_email_address_key` and `clients_instance_wa_phone_key` with `WHERE deleted_at IS NULL` (phone keeps `AND wa_phone IS NOT NULL`); add `clients_instance_deleted_idx`. Verify with `npm run db:migrate` and `\d clients` showing both partial indexes.
- [x] 1.2 Add `deleted_at` / `deleted_by` to `ClientRow` in `src/db/types.ts` and verify `npm run typecheck` passes.

## 2. Queries module

- [x] 2.1 In `src/db/queries/clients.ts` add the `LIVE` predicate to `getById`, `getByIdForUser`, `getByIdForInstance` (with an `includeDeleted` option), `listForUser`, `listForInstance`, `getByEmailAddressForUser`, `getByEmailAddressForInstance`, `getByWaPhoneForInstance`, `listDraftingWithoutSchedule`, `listOverdueForAgentTypes`, and the `WHERE` of `markOverdueStopped`; verify by a unit test that inserts a client, marks it deleted, and gets `null` from each lookup (`tests/clientLifecycle.test.ts`).
- [x] 2.2 Add `getAnyById`, `listDeletedForInstance` (newest deletion first, with the deleter's name) and `markDeleted` (returns false when already deleted or not the instance's); delete `removeForInstance` and `removeForUser`; verify the same test covers a double `markDeleted` returning false.
- [x] 2.3 Add `c.deleted_at IS NULL` to both `dashboard.listClientSummaries` queries and to `agentInstances.listAllWithClientCounts`; verify the test asserts a deleted client is absent from the summaries and the count.
- [x] 2.4 Grep `FROM clients` / `JOIN clients` outside `clients.ts`, confirm each remaining site is a display join (`emails.ts`, `llmCalls.ts`, `auditEvents.ts`), and record the list in the commit message.

## 3. Delete route, audit, in-flight work

- [x] 3.1 Add `client.deleted` to `AuditAction` in `src/audit/audit.ts`; verify `tests/audit.test.ts` accepts the action.
- [x] 3.2 Rewrite `DELETE /api/workspace/clients/:id`: cancel the pending send under the client lock, `markDeleted` with `req.realUserId`, publish the roster tick, record the audit event; remove the blob snapshot and `deleteBlob` loop and the now-unused import. Verify by deleting a client with files locally: the row has `deleted_at`, `document_files` rows and blobs remain, the audit page shows `client.deleted`.
- [x] 3.3 Fix `src/queue/resyncScheduledJobs.ts` to return when the live read is `null`; audit `replanWorker.ts`, `taxFetchWorker.ts`, `closingMessage.ts`, `notifyAccountant.ts` and `plan.ts` for by-id reads whose `null` branch continues and add a logged `return` where needed. Verify by deleting a paused client that has a scheduled-send row and restarting the worker: nothing is re-queued (worker log).
- [x] 3.4 Switch the display reads to `getAnyById`: `llmAdmin.ts` (call detail client, client filter), `reviewAdmin.ts` (review targets), and the step/call modal client lookups in `declarationOfCapital/router.ts`; verify a call of a deleted client still opens in the call browser with the client's name.
  - Implementation note: `reviewAdmin.ts` was left on the live `getById` on purpose — its reads sit in the approve / regenerate / pause paths (writes), which the spec says must refuse a deleted client; switching them would let an admin send a deleted client's held draft. `router.ts` has no display-only by-id read (its `onDocumentsChanged` is a write path, kept live). `llmAdmin.ts`: conversation viewer + call detail → `getAnyById`; the instance roster endpoint lists deleted clients after the live ones, flagged `deletedAt`, so the call browser's client filter keeps them.

## 4. Workspace API

- [x] 4.1 `GET /api/workspace/clients?deleted=1`: 403 unless `req.realUserId !== req.userId`; returns `listDeletedForInstance` through `toWorkspaceClient` with `deletedAt` and `deletedBy`. Verify with curl as an accountant (403) and under view-as (list).
- [x] 4.2 Per-client read routes (`GET /clients/:id`, thread, documents, files, trace, file streaming, step and call modals) load with `includeDeleted: isViewingAs(req)`; every write route (patch, pause/resume, WhatsApp toggle, due date, document actions, kickoff, retry send, delete) stays live-only. Verify by a route test: resume on a deleted client → 404; thread under view-as → 200; thread as the accountant → 404.
- [x] 4.3 `toWorkspaceClient` adds `deletedAt` / `deletedBy`; update `web/src/api.ts` client type. Verify `npm run typecheck`.

## 5. Web

- [x] 5.1 `Sidebar`: "deleted clients" toggle shown only when the session has `impersonating`; on, fetch `?deleted=1` with `background: true` and list clients with their deletion date, newest first; off, the live list as today. Verify in the browser under view-as; verify the toggle is absent as a plain accountant.
- [x] 5.2 `ClientView`: when `deletedAt` is set, render a banner with the date and deleter, and pass `readOnly` so the composer, header actions, `DocumentsCard` actions, WhatsApp card and delete button do not render; thread, documents, files and trace still open. Verify in the browser: no action control on a deleted client, file step modal shows the document.
- [x] 5.3 `DeleteClientModal` / `i18n.tsx`: new wording (client leaves the list; messages, documents and files are kept for the records; the same phone or email can be added again as a new client). Verify the modal text in the browser.
- [x] 5.4 Add-client form: adding the email / phone of a deleted client succeeds and creates a new client; adding a live duplicate still shows the existing error. Verify in the browser on the local stack.

## 6. Docs and verification

- [x] 6.1 Update `docs/agents.md` (client identity: live-only uniqueness; delete keeps data; admin deleted view; `getById` is live-only, `getAnyById` for display) and `docs/pipeline.md` if a named function was added. Verify the sections read correctly.
- [ ] 6.2 Live check on the local stack: delete a WhatsApp client, send a message from its number (ignored, logged as unknown), re-add the client from the monday kickoff, send again (routed to the new client only). Record the outcome in the task log; if skipped, say so.
  - Skipped in the implementing session (no dev stack / Twilio from the agent's shell). Covered at the query level by `tests/clientLifecycle.test.ts` (phone lookup → null after delete, → the new client after re-add) and at the route level against a throwaway database (delete → 404 on every write, re-add 201 with a new id, `client.deleted` audit row). Left for the owner to run on the local stack.
- [x] 6.3 Run `npm test` and `npm run typecheck`; commit per the repo git workflow (pull --rebase, typecheck, push). Note in the commit that production and the local DB need migration 063.
  - Verified on an identical tree: `npm run typecheck` (server + evals) and the web `tsc` + `vite build` clean; `npm test` 584/584; `npm run test:db` 2/2 against a fresh Postgres 16 with migrations 001–063 applied (`\d clients` shows both partial unique indexes); a route check as the accountant and under view-as (list 403 / 200, every write route 404 on a deleted client, reads 200 under view-as only, audit row with the acting user, re-add 201 with a new id, live duplicate 409).
