## Why

An admin's "view as accountant" session ends 30 minutes after it starts, no matter how active the admin is. When it lapses mid-work the server silently goes back to the admin's own identity, while the open workspace still shows the "viewing as" box. Every load and action then fails with a misleading "Agent not found.", because the agent belongs to the accountant and not to the admin. The admin has no way to tell what happened or how to recover.

## What Changes

- The view-as session becomes sliding: user activity extends it, and it ends only after a period with no activity (default 24 hours, one configurable setting). The fixed 30-minute limit goes away.
- Only real user activity extends the session. The workspace's own background refreshes (periodic polling, live-update streams) do not, so a forgotten open tab still times out.
- The workspace tells the server whose workspace it believes it is showing. When that no longer matches the server's view (session idled out, or ended from another tab), the server answers with a distinct "view-as session ended" response instead of acting as the admin and returning a misleading "not found".
- The workspace reacts to that response from any request with a styled in-app dialog: the session ended, with one button to start a new session for the same accountant and return to the same agent and client, and one to go back to the admin panel. No browser popups.
- Idle expiry is written to the audit trail next to the existing start and stop events. Actions taken while viewing as an accountant stay attributed to the real admin.
- The monday custom object is unaffected: it has no view-as mode.

## Capabilities

### New Capabilities

- `admin-impersonation`: how an admin's view-as session starts, stays alive, ends, and how the workspace behaves when it has ended.

### Modified Capabilities

None. `admin-message-review` and `conversation-trace` rely on "an admin who is impersonating" but their requirements do not change.

## Impact

- `src/api/auth.ts` — impersonation cookie lifetime, sliding refresh, ended-session detection in `requireAuth`.
- `src/config/env.ts`, `.env.example` — new idle-timeout setting.
- `src/audit/` — new idle-expiry audit event.
- `web/src/api.ts` — view-as declaration on workspace requests and header-less URLs, background-request marker, ended-session signal.
- `web/src/App.tsx`, a new dialog component, `web/src/i18n.tsx`, `web/src/styles.css`.
- `web/src/components/ClientView.tsx`, `Overview.tsx` — mark their periodic refreshes as background.
- `tests/` — unit tests for the cookie evaluation; `docs/agents.md` — impersonation notes.
- No database migration. Security posture changes: a view-as session can now last as long as the admin stays active (see design.md, Risks).
