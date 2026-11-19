## Why

The "update monday permissions" notice (openspec `monday-connection`) sends the accountant to monday's approval page, but monday checks the requested scopes against the app version installed on the *accountant's* monday account. An account still on an older version answers "Invalid scope param" and the accountant is stuck: the fix (update the FiscalMind app on their monday account) is a page they do not know, and the admin has to send them a link by hand. Seen live on 2026-11-19 after `users:read` was added.

## What Changes

- The notice becomes a two-step instruction: (1) update the FiscalMind app on your monday account, with a link that opens the app's fixed install page (`https://auth.monday.com/oauth2/authorize?client_id=<MONDAY_CLIENT_ID>&response_type=install`, read from the Developer Center "Share app" button on 2026-11-19); (2) press "Update monday permissions". The link is built by the server from the client id, so nobody has to send it by hand. An account that already runs the live version just sees "already installed" on that page, so the step is always safe to show.

## Capabilities

### New Capabilities
- (none)

### Modified Capabilities
- `monday-connection`: the "accountant grants missing permissions" requirement gains the install link and the two-step text.

## Impact

- `src/api/mondayScopes.ts` (install URL helper), `src/api/mondayOauth.ts` (status route adds `installUrl`).
- `web/src/api.ts`, `web/src/components/ClientSourcesSettings.tsx`, `web/src/i18n.tsx`, `web/src/styles.css`.
- `docs/agents.md` / `docs/monday-app.md`: the "adding a scope" recipe mentions the install link.
- No migration, no new env vars.
