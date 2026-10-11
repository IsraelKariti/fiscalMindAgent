## Why

The WhatsApp sender picture comes from `web/public/logo.png`, a purple shield that is not the product's icon; the web app itself uses `web/public/petal-seal.svg` (tab icon, sidebar brand mark). The only way to change the sender picture today is an env var (`TWILIO_WA_SENDER_LOGO_URL`) or the Twilio console, and the console upload is overwritten the next time the number is re-assigned. There is no place where an admin owns the logo, and no way to give one agent instance its own icon.

## What Changes

- **One order for pictures.** The picture an agent shows on WhatsApp is resolved in this order: the agent instance's own icon, else the app logo uploaded by an admin, else the built-in default (a PNG copy of the petal seal). The wrong `logo.png` and the `TWILIO_WA_SENDER_LOGO_URL` env var are removed.
- **App logo in the admin settings page.** An admin uploads the app logo (PNG or JPEG, size cap) in a new card on the admin settings page, sees the current one, and can remove it to go back to the built-in default. This logo is only the default for WhatsApp senders; the web app keeps its built-in petal seal for the tab icon and brand mark.
- **Per-agent icon on the agent page.** An admin uploads an icon for one agent instance on that agent's admin page (next to the email address, tax year and WhatsApp number), sees the effective picture and whether it is the agent's own or the default, and can remove it.
- **Public serving.** Uploaded pictures are stored in the platform's blob container under unguessable keys and served by a public, unauthenticated route so Meta can fetch them and the admin pages can preview them. A replacement gets a new URL; the old one stops resolving.
- **WhatsApp follows the pictures.** Registration ("buy number") and assignment send the effective picture, as today. A change of an agent's icon pushes the new picture to that agent's sender right away; a change of the app logo pushes it to every sender whose agent has no own icon.

## Capabilities

### New Capabilities
- `agent-profile-picture`: admin upload, removal and public serving of the app logo and of per-agent-instance icons, and the resolution order "agent icon, else app logo, else built-in default".

### Modified Capabilities
- `whatsapp-sender`: the logo sent to Twilio on registration and assignment becomes the instance's effective picture; picture changes are pushed to the affected senders; the env-configured logo URL is removed.

## Impact

- Database: migration adding `agent_instances.logo_blob_key` (nullable text); the app logo lives in `app_settings` under one key. Local DB and production need the migration.
- Static assets: `web/public/logo.png` deleted; `web/public/petal-seal.png` added (rendered once from the SVG) as the built-in default.
- Config: `TWILIO_WA_SENDER_LOGO_URL` removed from `src/config/env.ts` and `.env.example`; `resolveSenderLogoUrl` in `src/twilio/senderProfile.ts` is replaced by the new resolution helper.
- `src/twilio/provision.ts`: `provisionWhatsAppNumber` and `alignSender` take the effective picture URL from the caller.
- `src/api/admin.ts`, `src/api/waAdmin.ts`, `src/api/router.ts`: new admin routes for the app logo and the agent icon; the admin agent listing gains picture URLs.
- New `src/storage/logos.ts` (keys, validation, resolution) and `src/webhook/logoRoute.ts` (public route), mounted in `src/webhook/app.ts`.
- `web/src/components/admin/AdminSettings.tsx`, `web/src/components/admin/AgentPage.tsx`, `web/src/api.ts`, `web/src/i18n.tsx`, `web/src/styles.css`: the two new cards.
- `docs/agents.md`: WhatsApp sender paragraph rewritten around the three-level order.
- Production: existing senders keep the old shield until an admin uploads the app logo (pushed to all senders without an own icon) or re-assigns a number.
- No new dependencies (no image processing; files are stored as uploaded; the PNG default is rendered once with the Playwright already in the project).
