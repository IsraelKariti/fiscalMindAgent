## Why

The three waits of the conversation (quiet window after the client's last message, maximum wait of a turn, delay after the agent's own delivered message) are env variables (`INBOUND_QUIET_SECONDS`, `INBOUND_MAX_WAIT_SECONDS`, `AFTER_SEND_PLAN_DELAY_SECONDS`). Changing one in production means an app-setting edit and a restart of both the web and the worker, and the admin cannot even see the live value from the dashboard (today the local `.env` says 125 s while the code default is 15 s, and nobody can tell from the UI what production uses). The admin should set and see these in the dashboard, like the model and budget settings.

## What Changes

- A new "message timing" section on the admin settings page (`#/settings`) shows and edits the three waits in seconds: quiet window, maximum wait, delay after a sent message. Saving takes effect on the next decision, no restart.
- The values are stored as app settings (like the model and budget settings). An unset value falls back to the env variable, and that to the code default, so nothing changes until an admin saves.
- Validation: whole numbers; quiet window and maximum wait at least 1 s; after-send delay at least 0 s (0 = plan at once, as before `after-send-plan-delay`); the maximum wait must be at least the quiet window.
- The discarded-message analytics tab keeps showing "now" on the wait curve, read from the effective (saved or env) quiet window.
- The env variables stay as defaults and are documented as such in `.env.example`.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `inbound-turn`: the quiet window, the maximum wait and the after-send delay become admin-set values with env fallbacks; a new requirement "Admin settings show and edit the message timing".

## Impact

- `src/orchestration/timingSettings.ts` (new) — read/write of the three settings with the env fallback.
- `src/orchestration/requestReplan.ts`, `src/orchestration/inboundTurnCore.ts`, `src/queue/replanWorker.ts`, `src/orchestration/inboundTurn.ts`, `src/api/messageAnalyticsAdmin.ts` — read the values per decision instead of once at module load.
- `src/api/admin.ts`, `src/api/router.ts` — GET/PUT `/api/admin/message-timing`.
- `web/src/api.ts`, `web/src/components/admin/AdminSettings.tsx`, `web/src/i18n.tsx` — the section.
- `tests/inboundTurn.test.ts` (+ a new small test for the settings resolver) — timing values passed as functions.
- `.env.example`, `docs/pipeline.md` — wording.
