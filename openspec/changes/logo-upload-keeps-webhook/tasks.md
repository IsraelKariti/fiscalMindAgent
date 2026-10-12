## 1. Plan builder

- [x] 1.1 In `src/twilio/senderProfile.ts` make `wanted.webhookUrl` optional in `planSenderUpdate`: no `webhook` key and `webhookChanged: false` when it is undefined; verify with new cases in `tests/senderProfile.test.ts` (logo-only plan when the webhook is undefined and the current callback points elsewhere; null when the logo already matches even though the callback points elsewhere) and `npm test` passing.

## 2. Two Twilio update paths

- [x] 2.1 In `src/twilio/provision.ts` replace `alignSender` with `claimSender(phoneNumber, pictureUrl)` (webhook + logo, same failure rules as today) and `pushSenderPicture(phoneNumber, pictureUrl)` (logo only, throws on a Twilio failure), sharing one private helper for the sender lookup and the snake_case update; doc comments name the allowed callers; verify `npm run typecheck` passes and `grep -rn alignSender src scripts` returns nothing.
- [x] 2.2 Switch `adminUpsertWaSender` in `src/api/waAdmin.ts` to `claimSender` and `pushPicture` in `src/api/logoAdmin.ts` to `pushSenderPicture`; verify `npm run typecheck` and `npm test` pass.

## 3. Docs and verification

- [x] 3.1 Update the WhatsApp sender paragraph in `docs/agents.md`: assignment and purchase claim the number's webhook, picture uploads only change the profile logo; verify the text matches the built behaviour.
- [x] 3.2 Live check against Twilio: point a sender's webhook at a foreign address (or use one held by production), upload an app logo or agent icon locally, then read the sender with the Twilio Senders API and confirm the logo changed and the webhook did not; then re-assign the number locally and confirm the webhook is claimed. Record the result in this file.
  Result (2026-10-12, owner-free run from a script, since the local `APP_BASE_URL` is `http://localhost` and an upload there sends no picture): `pushSenderPicture("+18783484831", "https://agent.fiscalmind.app/petal-seal.png")` on the sender held by production — before: webhook `https://agent.fiscalmind.app/webhooks/twilio`, logo `logo.png`; after: webhook unchanged, logo `petal-seal.png` (Twilio applied it within about a minute). Re-assignment claim already verified the same day on `+13186166726` (webhook moved to the local ngrok address).
- [ ] 3.3 Commit per the repo Git workflow (pull --rebase, typecheck, commit, push).
