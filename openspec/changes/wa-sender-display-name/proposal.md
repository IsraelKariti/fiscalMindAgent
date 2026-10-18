## Why

Every WhatsApp number the platform buys registers with the same display name, the environment value `TWILIO_WA_SENDER_NAME` ("FiscalMind"). The client of an accountant knows the accountant's office, not FiscalMind, so the name next to the chat means nothing to them, and it clashes with the office logo now used as the sender picture. Meta reviews every display name and allows roughly one change per month, so the name must be right at purchase time.

## What Changes

- The admin "buy number" step gets a text field for the WhatsApp display name. It is prefilled and the admin can edit it before confirming.
- The default is `<accountant name> by <platform brand>` ("אריה רותם ושות' by FiscalMind"): the accountant's admin-entered Hebrew name, else their Google name, else the platform brand alone. When the number registers under the accountant's own connected WABA, the default is the accountant's name alone (no "by" suffix is needed for a business that owns its account).
- The platform brand part stays the environment value `TWILIO_WA_SENDER_NAME` (default "FiscalMind"); it no longer serves as the whole name.
- The server validates the name (trimmed, 3 to 100 characters, single line) and registers the sender with it.
- The submitted name is stored with the sender row and shown on the admin agent page next to the number, so an admin can see what Meta is reviewing.
- Assignment, re-assignment, pool operations and picture updates keep never touching the display name (unchanged).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `whatsapp-sender`: the requirement "Auto-provisioned senders carry the platform profile" changes from a fixed configured display name to an admin-chosen name with a per-accountant default; a new requirement records and shows the submitted name.

## Impact

- `src/api/waAdmin.ts` (provision route: request schema, default name, validation), `src/twilio/provision.ts` (display name parameter), `src/twilio/senderProfile.ts` (pure default-name helper), `src/db/queries/waSenders.ts` + migration 065 (`wa_senders.display_name`), `src/db/types.ts`.
- `web/src/components/admin/AgentPage.tsx` (buy modal with an input), `web/src/api.ts`, `web/src/i18n.tsx`, `web/src/components/ConfirmModal.tsx` (optional input slot) or a small dedicated modal.
- `.env.example` and `docs/agents.md` wording for `TWILIO_WA_SENDER_NAME`.
- Tests: `tests/senderProfile.test.ts` (default-name cases).
- Production needs migration 065. No change to existing senders: their names stay as registered.
