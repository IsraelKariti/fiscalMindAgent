## 1. Data model

- [x] 1.1 Add `migrations/067_clients_is_test.sql` (`ALTER TABLE clients ADD COLUMN is_test boolean NOT NULL DEFAULT false`) and `is_test` on `ClientRow`; verify `npm run db:migrate` applies it and `npm run typecheck` passes
- [x] 1.2 `clients.insert` accepts `isTest`; `getByIdForInstance` accepts `includeTest`; `listForInstance`, `listOverdueForAgentTypes`, `dashboard.listClientSummariesForInstance` / `listEmailActivityForInstance` / `countFilesForInstance`, and `agentInstances.listAllWithClientCounts` exclude `is_test` rows; add `listForInstance(instanceId, { includeTest })` for the admin list; verify with a DB test (next task)
- [x] 1.3 Add `tests/testClientVisibility.test.ts` (DB test, `npm run test:db` style like `clientLifecycle.test.ts`): a test client is absent from every accountant-facing query above, present in the admin list, found by `getByWaPhoneForInstance`, and `getByIdForInstance` returns it only with `includeTest`; verify the test passes against the local database

## 2. Enrollment and route

- [x] 2.1 Extract the kickoff's insert + catalog seed + audit into `enrollDeclarationClient(instance, identity, { isTest, source })` in `kickoff.ts`, keep `resolveDeclarationClient` calling it; verify `npm test` (formIntake/kickoff tests) and `npm run typecheck` pass and the kickoff audit detail is unchanged
- [x] 2.2 Add `src/agents/declarationOfCapital/testClient.ts`: zod `TestClientSchema`, `createTestClient(instance, actorUserId, body)` (normalise phone, 409 on live phone collision, enroll with `isTest: true`, `applyFormIntake` when answers exist, `draftFirstEmail`, `client.test_created` audit with the admin actor, `publishInstanceClientsUpdated`); add the audit action to `AuditAction`; verify with a unit test on the schema (invalid phone, bad year, >40 answers rejected) and `npm run typecheck`
- [x] 2.3 Add `POST /clients/test` to the declaration-of-capital router: 403 unless `isViewingAs(req)`, 400 on schema/phone errors, returns `{ client }`; verify with curl while impersonating (201/200 with `isTest: true`) and as the accountant (403)
- [x] 2.4 Add `clientScope(req)` in `src/api/viewAs.ts` and route every `getByIdForInstance(` call in `workspace.ts` and the agent router through it (reads also keep `includeDeleted`); `toWorkspaceClient` exposes `isTest`; verify by grep that no plain two-argument call remains, and by curl that the accountant's session gets 404 on a test client's routes while the admin's view-as gets the data

## 3. Web

- [x] 3.1 `Client.isTest` in `web/src/api.ts` plus `createTestClient(args)` on the workspace api; `AgentTypeUI.adminTestPanel?` in `types.ts`; Hebrew strings in `i18n.tsx` (tab "בדיקה", chip "מנהל", badge "לקוח בדיקה", form labels, lead text, errors); verify `npm run typecheck`
- [x] 3.2 Build `TestClientForm` (name, phone, year prefilled, id, file number, marital status, spouse name/id, questionnaire rows with add/remove, submit button, error banner) and register it as `adminTestPanel` on `declarationOfCapitalUI`; verify in the browser that a valid submit creates the client and an invalid phone shows the error
- [x] 3.3 `Settings.tsx`: new `test` tab shown only when `impersonating && adminTestPanel`, admin chip + `client-tab-admin` style, stored tab 'test' honoured only then; `Workspace.tsx` passes `impersonating`, the panel and an `onCreated` that reloads the roster and navigates to the client; verify in the browser as admin (tab visible, marked) and as the accountant (no tab, stored 'test' opens general)
- [x] 3.4 `Sidebar.tsx`: "לקוח בדיקה" badge and `client-item-test` style on test clients in the live and deleted lists; styles in `styles.css`; verify in the browser that the badge shows for the test client only

## 4. Verification and docs

- [x] 4.1 End-to-end as admin viewing as the accountant: create a test client with two questionnaire answers, check the catalog items are seeded and the answered ones pre-resolved, the held first draft appears with Resume, the audit page shows `client.test_created` with the admin as actor; then sign in as the accountant and confirm the client is absent from list, dashboard and link
- [x] 4.2 Document the test client in `docs/agents.md` (flag, scope helper, list of accountant-facing queries that must exclude it, the route and the tab); verify the section reads with the soft-delete section next to it
- [x] 4.3 Run `npm run typecheck`, `npm test`, `npm run test:db`; commit per the repo git workflow
