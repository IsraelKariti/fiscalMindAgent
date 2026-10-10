## Why

Every WhatsApp sender the platform registers on Twilio gets only a display name; no profile picture is ever sent, so clients see WhatsApp's empty default avatar next to the agent's messages. A branded picture is the first trust signal a client gets when an unknown number writes to them, and the logo already exists in the web app (`web/public/logo.png`) but is not wired to the sender profile.

## What Changes

- New env setting for the sender profile logo URL. It defaults to the dashboard's public logo (`<APP_BASE_URL>/logo.png`) and can be overridden.
- Auto-provisioned senders ("buy number") register with the logo in their profile, next to the existing display name.
- Assigning a number to an agent instance (admin panel / `POST /api/admin/wa-senders`) also applies the logo to that sender's profile when it is missing or different, the same way the inbound webhook is already claimed. Re-assigning an existing number is the way to retrofit senders registered before this change.
- A logo URL that Twilio/Meta cannot fetch (not `https`, e.g. the local `http://localhost:3000` default) is skipped with a log line; it never blocks provisioning or assignment.
- The sender's display name is left untouched on assignment (only the logo is applied), so an externally registered sender keeps its Meta-approved name.

## Capabilities

### New Capabilities
- `whatsapp-sender`: registration and assignment of WhatsApp sender numbers on Twilio for agent instances — the profile (display name, logo) and inbound webhook every sender must carry.

### Modified Capabilities
<!-- none: no existing spec covers sender provisioning -->

## Impact

- `src/twilio/provision.ts`: sender creation body gains `profile.logo_url`; the webhook-claim step on assignment also aligns the logo.
- `src/config/env.ts` and `.env.example`: new `TWILIO_WA_SENDER_LOGO_URL` (optional, defaulted).
- `src/api/waAdmin.ts`: no API shape change; the assign route's Twilio call now also updates the profile.
- `docs/agents.md`: WhatsApp sender section mentions the logo.
- Production: the `fiscalmind-il-web` app already serves `logo.png` at the dashboard root, so the default works there without new env. Existing prod senders need one re-assign from the admin panel (or a manual upload in the Twilio console) to pick up the logo.
- No database change.
