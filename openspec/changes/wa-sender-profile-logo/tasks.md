## 1. Configuration

- [x] 1.1 Add `TWILIO_WA_SENDER_LOGO_URL` to `src/config/env.ts` (optional URL, default `${APP_BASE_URL}/logo.png`, trailing slash safe) and document it in `.env.example` next to `TWILIO_WA_SENDER_NAME`; verify `npm run typecheck` passes and the parsed env shows the default when the var is unset.

## 2. Provisioning

- [x] 2.1 Add `senderLogoUrl()` in `src/twilio/provision.ts` that returns the configured URL only when it is `https`, logging a skip otherwise; add a unit test in `tests/` covering https, http and unset cases.
- [x] 2.2 Include `profile.logo_url` in the sender create body of `provisionWhatsAppNumber` when `senderLogoUrl()` returns a value; verify by unit-testing the body builder (extract the body construction into a small pure function) for both the logo and no-logo cases.

## 3. Assignment

- [x] 3.1 Replace `claimSenderWebhook` with `alignSender(phoneNumber)` that lists the sender once and sends at most one update carrying the webhook (when different) and `profile.logo_url` (when missing or different), never `name`; a logo-only update is wrapped so its failure is logged and swallowed, a webhook update still throws; verify with unit tests using a stubbed Twilio client for the four cases (nothing to do, webhook only, logo only, both).
- [x] 3.2 Update the call in `src/api/waAdmin.ts` (`adminUpsertWaSender`) and any other caller to the new function; verify `npm run typecheck` and `npm test` pass.

## 4. Docs and verification

- [x] 4.1 Update the WhatsApp sender paragraph in `docs/agents.md` to mention the profile logo and how to retrofit an existing sender (re-assign, or Twilio console upload).
- [ ] 4.2 Live check (owner, needs Twilio credentials): re-assign the current production or sandbox sender from the admin panel, then confirm the logo shows in Twilio console → WhatsApp senders → profile and in a WhatsApp chat from a phone; record the result in this file.
- [ ] 4.3 Commit per the repo Git workflow (pull --rebase, typecheck, commit, push).
