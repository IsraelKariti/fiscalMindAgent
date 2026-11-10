## Why

The declaration-of-capital conversation starts from the questionnaire the client filled on the office's monday WorkForm (openspec `declaration-kickoff`): its answers pre-resolve the checklist and feed every planner turn as the `SUBMITTED QUESTIONNAIRE` prompt section. An admin debugging a conversation today has no place in the workspace to see what the client actually wrote — the answers are stored on the client record but the only ways to read them are the LLM call modal's prompt text or a database query. A dedicated, admin-only view of the filled form makes "why did the agent ask / skip this?" answerable at a glance.

## What Changes

- A new **"שאלון" (questionnaire) tab** on every declaration-of-capital client, shown only while an admin views the workspace as the accountant (the same view-as session that shows the Settings "בדיקה" tab, openspec `admin-test-client`). The tab carries the same admin-only marker as that tab.
- The tab lists the questionnaire the client submitted, as stored on the client at kickoff: one card per question, the question as the title and the client's answer beneath it, in the form's order. Answers are shown as plain text.
- A client with no stored questionnaire (enrolled before answers were stored, no linked form item, or every answer blank) shows an empty state that says no questionnaire is stored.
- The accountant's own session and a staff viewer never see the tab; a remembered tab choice of "questionnaire" falls back to the Conversation tab outside an admin's view-as session.
- No server change: the answers already reach the browser on the client record. No monday read, no edit, no re-fetch.

## Capabilities

### New Capabilities
- `admin-questionnaire-tab`: the admin-only questionnaire tab on a declaration-of-capital client — who sees it, what it shows, and the empty state.

### Modified Capabilities
- none. `admin-test-client` keeps its requirements; a test client created with questionnaire answers shows them in the new tab like a kickoff client, with no new rule.

## Impact

- Web only: `web/src/agents/types.ts` (an `adminOnly` flag on a client tab and an `admin` flag in the tab context), `web/src/components/ClientView.tsx` (filter admin-only tabs, admin marker on the tab button), `web/src/components/Workspace.tsx` (pass the view-as state down), `web/src/agents/declarationOfCapital.tsx` (the new tab), a new `web/src/components/QuestionnaireCard.tsx`, `web/src/api.ts` (`form_answers` on the client's agent fields type), `web/src/i18n.tsx`, `web/src/styles.css`.
- Docs: a short note in `docs/agents.md` (frontend section) and the `admin-test-client` cross-reference.
- No migration, no API route, no prompt or planner change, no production step beyond the deploy.
