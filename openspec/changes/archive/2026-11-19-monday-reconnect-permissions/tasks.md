## 1. Server: missing-scope computation

- [x] 1.1 Add `src/api/mondayScopes.ts` with `requestedMondayScopes()` and `missingMondayScopes(stored: string | null): string[]` (whitespace/comma split, trim, lowercase, Set difference, `null` → `[]`); move `MONDAY_OAUTH_SCOPES` there and import it in `mondayOauth.ts`.
- [x] 1.2 `mondayConnectionStatus` returns `missingScopes` alongside `configured`, `connected`, `scopes`.
- [x] 1.3 Unit test `tests/mondayScopes.test.ts`: old token missing `users:read`; reordered scopes → `[]`; `null` → `[]`; comma-separated input.

## 2. Web: notice and update button

- [x] 2.1 `web/src/api.ts`: add `missingScopes: string[]` to `MondayConnection`.
- [x] 2.2 `web/src/i18n.tsx`: Hebrew strings for the notice title, the consequence sentence (tax advisor not recognized, board status not written), and the button "Update monday permissions".
- [x] 2.3 `ClientSourcesSettings.tsx`: `openConnectPopup` takes an `isDone(conn)` predicate (default `conn.connected`); connected branch renders the warning notice + button when `connection.missingScopes.length > 0`; button calls `openConnectPopup(api.mondayConnectUrl, api.mondayConnection, 'fm-monday-connected', (c) => c.missingScopes.length === 0)`; no Disconnect needed.
- [x] 2.4 Warning style: reuse an existing warning notice class in `web/src/styles` or add `.settings-notice-warning` (amber, RTL-safe).

## 3. Docs and verification

- [x] 3.1 `docs/agents.md`: replace the two "must reconnect monday" notes (tax advisor, board write-back) with a pointer to the Settings notice; document the "adding a scope" steps.
- [x] 3.2 `npm run typecheck` and `npm test` pass.
- [ ] 3.3 Live check (owner): set a local token's `scopes` to `boards:read boards:write docs:read` via docker psql, open Settings → notice shown → press the button → approve → notice gone and `scopes` row updated.
