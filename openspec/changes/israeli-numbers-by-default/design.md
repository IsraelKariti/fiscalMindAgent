## Context

`provisionWhatsAppNumber` (src/twilio/provision.ts) does one search, `availablePhoneNumbers('US').local.list({ smsEnabled: true, limit: 1 })`, buys the first hit and registers it as a WhatsApp sender. Twilio's Israel inventory (seen in the console on 2026-10-12) lists only **Mobile** numbers (+972 53…), $15/month, "Address requirement: None", voice + SMS. A manual console purchase of one went through without a regulatory bundle, so the API purchase should too. Twilio exposes number types as separate sub-resources (`local`, `mobile`, `tollFree`), so the search must name the type.

## Goals / Non-Goals

**Goals:**
- One place decides country + number type; the Twilio calls stay as they are.
- Default Israel without touching any environment; `US` stays one env var away for the sandbox or a test.

**Non-Goals:**
- Regulatory bundles (not needed for IL today; if Twilio starts requiring one, that is a new change).
- Letting the admin pick the country per purchase in the UI.
- Own-number (SIM) registration.

## Decisions

1. **Env var, not a DB setting.** `TWILIO_NUMBER_COUNTRY` (zod: 2 uppercase letters, default `IL`) next to the other Twilio settings in src/config/env.ts. The country is an environment property like the WABA id, not something admins change per agent. Alternative rejected: an admin-panel setting — more UI for a value that changes about never.

2. **Search plan as a pure helper.** A small exported function `numberSearchPlan(country)` returns the ordered list of number types to try (`['mobile', 'local']` for every country). `provisionWhatsAppNumber` loops over the plan, calling `client.availablePhoneNumbers(country)[type].list({ smsEnabled: true, limit: 1 })`, and buys the first candidate. Mobile first because Israel only sells mobile; for `US` mobile numbers are rare on Twilio so the fallback keeps US working as before (US local). Alternative rejected: a per-country table of types — more to maintain for the same result.

3. **Error names the country.** "Twilio has no IL numbers available for purchase right now." so a sandbox set to another country reads correctly.

4. **No UI change.** The Hebrew confirm text already says "a new number from Twilio"; the number itself appears on the agent page after purchase, so the admin sees the +972.

## Risks / Trade-offs

- [Twilio starts demanding a regulatory bundle for IL via the API (error 21649)] → the purchase fails loudly with Twilio's message; admin buys manually and assigns, as today. Documented in `.env.example`.
- [IL mobile numbers are marked beta in the console (`*`)] → inventory may be thin; the fallback to `local` and the clear error cover an empty search.
- [$15/month per number] → accepted by the owner; `TWILIO_NUMBER_COUNTRY=US` reverts.
- [Hosted-number auto verification differs for IL] → Twilio-hosted numbers skip the OTP for any country; the sender poll (CREATING → ONLINE) and the release-on-failure path are unchanged, so a failed registration still releases the number.

## Migration Plan

- Deploy; nothing to migrate. Existing US numbers keep working. Production env needs no new var (default IL). Sandbox: leave default or set `TWILIO_NUMBER_COUNTRY=US` if cheaper numbers are wanted there.
- Rollback: set `TWILIO_NUMBER_COUNTRY=US`.
