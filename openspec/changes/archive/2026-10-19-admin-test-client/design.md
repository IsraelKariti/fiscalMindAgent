## Context

See proposal.md for motivation. What shapes the approach today:

- The declaration-of-capital agent is `importOnlyClients`: the workspace has no add-client button, and `POST /clients` (workspace router) is a legacy edge path that ignores the kickoff's identity fields (id, spouse, questionnaire) and does not hold the first draft the kickoff way.
- Enrollment lives in `src/agents/declarationOfCapital/kickoff.ts` (`resolveDeclarationClient`): phone-keyed client, synthetic WhatsApp email, `paused: true`, `agent_fields` (tax_year, id_number, file_number, spouse, marital_status, form_answers), catalog seed rows, `client.auto_enrolled` audit. The webhook (`src/webhook/mondayKickoffRoute.ts`) then runs `applyFormIntake`, `draftFirstEmail` (hold mode because the client is paused) and `syncMondayStatus`.
- Soft delete (migration 063) already established the pattern for "a client only the admin sees": `LIVE` predicate in `clients.ts`, `isViewingAs(req)` (`src/api/viewAs.ts`), `includeDeleted` on `getByIdForInstance`, the sidebar toggle shown only while impersonating, and the accountant's link answering "client not found".
- The Settings view (`web/src/components/Settings.tsx`) has three tabs; the agent UI contributes one via `settingsPanel` + `settingsPanelTabKey`. `Workspace.tsx` knows `impersonatingEmail`.
- `syncMondayStatus` already returns silently for a client without `monday_item_id`, so a test client never touches monday even on goal completion.

## Goals / Non-Goals

**Goals:**
- One flag on the client row decides visibility; every accountant-facing read respects it with the same mechanism as soft delete.
- The test client goes through the real kickoff pipeline (seed, form intake, held first draft) so the admin tests what a monday client would get.
- Minimal new surface: one route, one form, one tab, one badge.

**Non-Goals:**
- No monday writes, no fake board rows.
- No "convert a test client to a real client" and no special send guard: resume sends real WhatsApp messages to the phone entered (that is the purpose).
- No per-agent-type generality beyond the registry hook: the form fields are declaration-of-capital specific; the panel hook lets another agent type add its own later.

## Decisions

1. **`clients.is_test boolean NOT NULL DEFAULT false` (migration 067)**, not an `agent_fields` key.
   The flag must be filterable in every roster SQL (`listForInstance`, `dashboard.*ForInstance`, `listAllWithClientCounts`, `listOverdueForAgentTypes`); a column keeps those clauses plain and indexable. Alternative rejected: a `test` prefix on the name or a reserved phone range (fragile, visible to the accountant).

2. **Visibility rule: a test client is "live for the admin, absent for the accountant".**
   `getByIdForInstance(id, instanceId, { includeDeleted?, includeTest? })` gains `includeTest`; the workspace router and the agent router load every client (reads and writes) through a small scope helper, `clientScope(req) = { includeTest: isViewingAs(req) }`, with reads also passing `includeDeleted`. The 11 plain `getByIdForInstance(id, instanceId)` calls become scoped calls. The accountant gets 404 everywhere; the admin's write routes work (unlike deleted clients, which stay read-only). Phone and email lookups (`getByWaPhoneForInstance`, `getByEmailAddressForInstance`) stay unscoped: inbound WhatsApp must reach the test client and the import scan must not enroll a second client with the same phone. Worker paths that read by plain id (`getById`) are untouched: the planner and the send worker treat the test client like any live client.
   Alternative rejected: hide only in the list query. Cheaper, but the accountant could still open the client by link, and the spec for deleted clients set the stronger rule.

3. **Enrollment reuse: extract the kickoff's insert + seed + audit into `enrollDeclarationClient(instance, identity, { isTest, source })` in `kickoff.ts`**, called by `resolveDeclarationClient` (monday identity) and by the new `createTestClient` (form identity, `src/agents/declarationOfCapital/testClient.ts`). `createTestClient` then runs `applyFormIntake` (when answers were given) and `draftFirstEmail`, and records `client.test_created` with `actorType: 'admin'`, `actorUserId: req.realUserId`. It never calls `syncMondayStatus` or stores monday ids.
   Alternative rejected: posting to the legacy `POST /clients` with extra fields. That route's contract (documents array, email required, due date) is the wrong shape and it drafts without the kickoff's intake.

4. **Route: `POST /clients/test` on the declaration-of-capital agent router**, guarded by `isViewingAs(req)` (403 "admin only" otherwise), body validated with a zod schema in `testClient.ts` (name, phone, taxYear 2000-2100, idNumber?, fileNumber?, maritalStatus?, spouseName?, spouseIdNumber?, formAnswers?: {question, answer}[] max 40). Phone normalised with `normalizeE164`; 400 when invalid, 409 on a live phone collision (same message as `POST /clients`). Returns `{ client }` serialized by `toWorkspaceClient` (which adds `isTest`).

5. **Web: `AgentTypeUI.adminTestPanel?: (ctx: { onCreated(client) }) => ReactNode`**, provided by `declarationOfCapital.tsx` as `<TestClientForm/>` (`web/src/agents/declarationOfCapital/TestClientForm.tsx` or next to the other DoC components, following the current file layout). `Settings` gets `adminTestPanel` and `impersonating` props from `Workspace`; the tab renders only when both are set; the stored tab 'test' is honoured only then. The tab button carries class `client-tab-admin` and a small chip "מנהל" styled with the impersonation-card accent so it reads as admin-only. On `onCreated`, `Workspace` reloads the roster and navigates to the new client (same path as the add-client modal).

6. **Sidebar badge:** `Client.isTest` from the serializer; `Sidebar` renders a chip "לקוח בדיקה" next to the name and adds class `client-item-test` (dashed accent border, same hue as the admin chip). Appears in both the live list and the deleted list; the accountant never receives such rows so no extra guard is needed client-side.

7. **Form fields** mirror what `resolveDeclarationClient` reads: name, phone, year (prefilled `defaultTaxYear(now)`), id, file number, marital status select, spouse name + id, questionnaire rows (question + answer inputs, add/remove). Answers are stored through the same `storableFormAnswers` path so the SUBMITTED QUESTIONNAIRE prompt block renders them.

## Risks / Trade-offs

- [Missed roster query keeps showing test clients to the accountant] → the DB test enumerates every accountant-facing query (`listForInstance`, dashboard summaries/activity/file count, `listAllWithClientCounts`, `listOverdueForAgentTypes`) and asserts the test client is absent; `docs/agents.md` lists them for the next roster query.
- [A write route left unscoped lets the accountant act on a test client by id] → one grep-verified sweep of `getByIdForInstance(` in `workspace.ts` and the agent router; the scope helper is the only allowed form afterwards.
- [Test client sends real WhatsApp messages] → intended; the form lead text says so and the client starts paused with a held draft, so nothing goes out before the admin resumes.
- [Admin-only visibility relies on `isViewingAs`] → same trust boundary as deleted clients and the trace toggle; an admin not impersonating uses the admin panel, which already reads any client.

## Migration Plan

1. Migration 067 adds the column (default false; existing rows unaffected). Local: `npm run db:migrate`; production applies it in the worker startup script.
2. Deploy code. Rollback: revert the code; the column is harmless if left in place.

## Open Questions

- None that change the plan. Whether the form should also accept an initial "paused = false" (send the first message at once) can be added later as a checkbox without changing the specs.
