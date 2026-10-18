## 1. Default name helper

- [x] 1.1 Add `defaultSenderDisplayName({ hebrewName, name, brand, ownWaba })` to `src/twilio/senderProfile.ts` (Hebrew name, else name, else brand alone; "<name> by <brand>" on the platform WABA, name alone on an own WABA) and verify with new cases in `tests/senderProfile.test.ts` (`npm test`).

## 2. Storage

- [x] 2.1 Add migration `065_wa_senders_display_name.sql` (`display_name text NULL`, comment explaining it is the name this platform submitted) and verify `npm run db:migrate` applies it locally.
- [x] 2.2 Extend `WaSenderRow` and `waSenders.upsertForInstance(agentInstanceId, phoneNumber, displayName?)` so a purchase stores the name and a hand assignment stores NULL; verify with `npm run typecheck` and a quick SQL read after the live check in 5.1.

## 3. Server

- [x] 3.1 Give `provisionWhatsAppNumber` a `displayName` parameter and remove the `env.TWILIO_WA_SENDER_NAME` read from `src/twilio/provision.ts`; verify `npm run typecheck` and the existing `buildSenderCreateBody` tests still pass.
- [x] 3.2 Add `GET /api/admin/wa-senders/:agentInstanceId/display-name-default` (admin-only, uses the helper, the accountant row from `users.getById` and the own-WABA lookup) and verify with curl that an accountant with a Hebrew name returns "<Hebrew name> by FiscalMind".
- [x] 3.3 Change the provision schema to `{ agentInstanceId, displayName }` (trim, 3–100 chars, single line), pass the name to `provisionWhatsAppNumber` and to the upsert; verify a two-character name returns 400 naming the display name and buys nothing.
- [x] 3.4 Add `waDisplayName` to the admin agent detail response and verify it in the JSON after 5.1.

## 4. Web

- [x] 4.1 Add `adminGetWaDisplayNameDefault` and the `displayName` argument of `adminProvisionWaSender` in `web/src/api.ts`, plus `waDisplayName` on the agent detail type; verify `npm run typecheck`.
- [x] 4.2 Build `BuyWaNumberModal` (portal, `dir="auto"` input prefilled from the default endpoint, naming-rules note, Confirm disabled while loading or invalid) and use it on `AgentPage.tsx` in place of the buy `ConfirmModal`; verify in the browser that the field shows the default and can be edited.
- [x] 4.3 Show the stored display name next to the number on the agent page (no line when NULL) and add the Hebrew strings to `web/src/i18n.tsx`; verify in the browser on a purchased and on a hand-assigned agent.

## 5. Docs and live check

- [ ] 5.1 Live check: buy a number for a test agent with the default name, confirm on Twilio Console that the sender profile name matches, release it afterwards; verify the agent page shows the name and the status line.
- [x] 5.2 Update `.env.example` (`TWILIO_WA_SENDER_NAME` is the brand part of the default) and the `docs/agents.md` paragraph on the sender profile; verify the wording matches the spec.
- [x] 5.3 Run `npm run typecheck` and `npm test`, commit per the Git workflow.
