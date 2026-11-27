## 1. Server: install link

- [x] 1.1 `src/api/mondayScopes.ts`: add `mondayInstallUrl(clientId: string | undefined): string | null` returning `https://auth.monday.com/oauth2/authorize?client_id=<id>&response_type=install`; unit test in `tests/mondayScopes.test.ts`.
- [x] 1.2 `mondayConnectionStatus`: add `installUrl` (null when the client id is unset).

## 2. Web: two-step notice

- [x] 2.1 `web/src/api.ts`: extend `MondayConnection` with `installUrl: string | null`.
- [x] 2.2 `web/src/i18n.tsx`: Hebrew strings for the two steps (link text, "already installed → go on" hint, step 2 label).
- [x] 2.3 `ClientSourcesSettings.tsx`: render the notice body as an ordered two-step list — link with `target="_blank" rel="noopener"` (only when `installUrl` is set), then the button.
- [x] 2.4 `web/src/styles.css`: `.settings-notice-steps` ordered list, RTL-safe.

## 3. Docs and verification

- [x] 3.1 `docs/monday-app.md` step 5 and `docs/agents.md` "Adding a monday scope": install URL format and the out-of-date account case.
- [x] 3.2 `npm run typecheck`, web `tsc`, and `npm test` pass.
- [ ] 3.3 Live check (owner): view as the accountant whose token lacks `users:read`; the notice shows the link as step 1 and the button as step 2; the accountant opens the link, updates the app, presses the button, the notice disappears.
