## Why

Declaration-of-capital clients can only be enrolled from a monday board row (CRM card + questionnaire item), so an admin who wants to exercise the agent on an accountant's instance has to create board rows in the accountant's monday account first, and the resulting client is a real one that the accountant sees. The admin needs a way to add a throw-away client by hand, inside the accountant's agent, that the accountant never sees.

## What Changes

- A new **"בדיקה" (test) tab** in the workspace Settings view, shown only while an admin views the workspace as the accountant. The tab is visibly marked as admin-only. It holds a form with the same identity the monday kickoff supplies (name, WhatsApp phone, declaration year, national id, file number, spouse, marital status, optional questionnaire answers) and a submit button.
- Submitting creates a **test client** on the accountant's agent instance: paused, seeded with the catalog checklist for its year, questionnaire answers pre-resolved as at kickoff, and its first message drafted and held exactly like a monday-kickoff client. No monday board is touched.
- A test client is **invisible to the accountant**: it is not in the client list, the dashboard, the overdue roster or any count, and its link answers "client not found" to the accountant. While an admin views as the accountant, the list shows it with a clear admin-only badge and the admin can work it like any live client (resume, reply, documents, delete).
- A new `clients.is_test` flag (migration) and an audit event for the creation, with the real admin as the actor.

## Capabilities

### New Capabilities
- `admin-test-client`: the admin-only test tab, the test-client form, what a test client is, and who can see and act on it.

### Modified Capabilities
- none. `client-lifecycle` (deletion) and `admin-impersonation` (session) keep their requirements; a deleted test client follows `client-lifecycle` like any client, under the admin's view only.

## Impact

- DB: migration `067_clients_is_test.sql` (`clients.is_test boolean not null default false`); `ClientRow.is_test`; the roster, dashboard and count queries gain a "not test" clause for the accountant.
- Server: `src/api/workspace.ts` (list + by-id scope), `src/agents/declarationOfCapital/router.ts` (new `POST /clients/test`, view-as only), a new `src/agents/declarationOfCapital/testClient.ts` that reuses the kickoff's enrollment + form intake + held first draft without monday, `src/db/queries/clients.ts`, `dashboard.ts`, `agentInstances.ts`, `src/audit/audit.ts` (new action), `workspaceSerialize.ts` (`isTest`).
- Web: `web/src/components/Settings.tsx` (admin-only tab), `web/src/agents/types.ts` + `declarationOfCapital.tsx` (test panel on the agent UI), a new `TestClientForm`, `Sidebar.tsx` (badge), `api.ts`, `i18n.tsx`, `styles.css`.
- Tests: a DB test in the `tests/clientLifecycle.test.ts` style for visibility; a unit test for the request schema; a `docs/agents.md` section.
- Production needs migration 067 (runs in the deploy flow).
