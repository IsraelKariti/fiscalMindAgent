## Why

The admin "buy number" button always purchases a **US** number (`availablePhoneNumbers('US').local`), so every agent instance ends up with a +1 number even though all clients are in Israel. The owner now buys Israeli numbers by hand in the Twilio console; the platform should do it itself.

## What Changes

- The platform's automatic purchase picks a number from a configured country, **Israel (`IL`) by default**, instead of a hard-coded US local number.
- The search adapts to what Twilio offers in that country: Israel sells "mobile" numbers (the console shows no "local" type), so the search tries mobile numbers first and falls back to local numbers. The number must support SMS so Meta can verify it.
- The error shown when Twilio has nothing to sell names the configured country, not "US".
- New optional env var `TWILIO_NUMBER_COUNTRY` (ISO 3166-1 alpha-2, default `IL`) documented in `.env.example`; the setup comment there stops saying "a US number".
- Twilio's region for the number (US1 routing) is unchanged — it is Twilio's data-center choice, not the number's country.

Not in scope: registering a non-Twilio number (prepaid SIM) through the platform, the Meta "official business account" badge, and changing the admin UI wording.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `whatsapp-sender`: new requirement — the number the platform buys for an agent instance comes from the configured country (default Israel), with the Twilio number type chosen to match that country's offering.

## Impact

- `src/twilio/provision.ts` — `provisionWhatsAppNumber` number search.
- `src/config/env.ts` — new `TWILIO_NUMBER_COUNTRY` setting.
- `.env.example` — document the var; fix the "US number" comment.
- New unit test for the pure search-plan helper (`tests/`).
- Cost: Israeli mobile numbers on Twilio rent for $15/month versus about $1 for US local — every new agent instance costs more. The owner accepts this; the env var lets an environment revert to `US`.
