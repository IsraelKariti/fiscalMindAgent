## Context

`GET /api/monday-connection` (`src/api/mondayOauth.ts`) already returns `missingScopes`, and `ClientSourcesSettings.tsx` renders the warning notice with the "update permissions" button. On 2026-11-19 an accountant pressed it and monday answered "Invalid scope param": monday validates the requested scopes against the app version installed on the *accountant's* monday account, and that account still had the version without `users:read`. Facts verified that day:

- The install page link is fixed per app: `https://auth.monday.com/oauth2/authorize?client_id=<MONDAY_CLIENT_ID>&response_type=install` (the "Add to monday.com" button on Developer Center → Distribute → Share app). Opening it on an account that already has the app shows "already installed"; on an account with an older version it offers the update and the new permissions.
- monday docs (app-versioning): a promoted version is pushed to installed accounts automatically, but scope changes need manual approval on that account.

## Goals / Non-Goals

**Goals**
- The accountant never needs the admin to send a link: the notice carries the install link and the two steps in order.
- Zero new configuration: the client id is already there.

**Non-Goals**
- Knowing in advance whether the account needs the update (monday's `app_installs` query needs the owner's personal token; dropped on 2026-11-19 — always showing both steps costs the accountant one harmless click at most).
- Updating the app on the accountant's account for them (monday has no API for it).

## Decisions

1. **Install link built on the server.** `mondayInstallUrl(clientId)` in `src/api/mondayScopes.ts` returns the fixed URL (null when the id is unset). The status route returns it as `installUrl`. Why server: the client id lives only there, and the URL format is a monday contract worth one named function + one test.

2. **Notice wording (Hebrew, `csMondayScopes*` keys).** Title unchanged. Body becomes an ordered two-step list: step 1 = link "update the FiscalMind app on your monday account" (`target="_blank" rel="noopener"`), with a short hint "if monday says the app is already installed, go on to step 2"; step 2 = the existing button. Reuse the `.settings-notice-warning` block; add `.settings-notice-steps` for the ordered list.

3. **Docs.** `docs/monday-app.md` step 5 and `docs/agents.md` "Adding a monday scope" mention the install link and the out-of-date-account case.

## Risks / Trade-offs

- **Accountant skips step 1** and gets "Invalid scope param" again: the notice stays and the hint text tells them to do step 1. Acceptable.
- **Install link on an up-to-date account** shows "already installed"; harmless.

## Migration Plan

None.

## Open Questions

- None.
