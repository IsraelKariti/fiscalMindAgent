## Why

Each time the agent needs a new monday permission (scope), every accountant who connected earlier must grant it again. Today nothing tells them, and the only way is Settings → Disconnect → Connect monday → approve: four steps, and the Disconnect step is pure ceremony because the callback already overwrites the stored token. Two scopes were added this way (`boards:write` for board write-back, `users:read` for the tax advisor on 2026-11-15) and accountants connected before them silently run with reduced features (advisor stored unmatched, board sync skipped).

## What Changes

- The server compares the scopes stored with the accountant's monday token against the scopes the app currently asks for, and reports the missing ones on the existing connection-status route.
- The Settings page shows a warning notice when scopes are missing, with one button that opens the monday approval popup directly (no Disconnect first). After approval the notice disappears.
- The "Connect monday" flow is reusable while already connected: pressing the update button re-runs the same OAuth start/callback and overwrites the stored token and scopes.
- The stored scope string is normalized to a set (order- and whitespace-insensitive) so a reordered scope string from monday never reads as "missing".

## Capabilities

### New Capabilities
- `monday-connection`: how an accountant connects their monday account to the workspace, what the app reports about that connection, and how the accountant grants permissions the app added after they connected.

### Modified Capabilities
- (none)

## Impact

- `src/api/mondayOauth.ts`: `mondayConnectionStatus` adds `missingScopes`; a small pure helper (new `src/api/mondayScopes.ts`) computes it from the stored string and `MONDAY_OAUTH_SCOPES`.
- `web/src/api.ts` `MondayConnection` type; `web/src/components/ClientSourcesSettings.tsx` monday row (notice + button, reusing `openConnectPopup`); `web/src/i18n.tsx` new Hebrew strings.
- `docs/agents.md`: replace the two "must reconnect monday" notes with a pointer to the update-permissions notice.
- No migration: `monday_oauth_tokens.scopes` already exists. The same panel is mounted inside the monday custom object, so the notice appears there too.
