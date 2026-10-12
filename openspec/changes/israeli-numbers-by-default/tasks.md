## 1. Configuration

- [x] 1.1 Add `TWILIO_NUMBER_COUNTRY` to src/config/env.ts (two uppercase letters, default `IL`) and verify `npm run typecheck` passes and a value like `israel` makes startup fail with a zod error naming the var
- [x] 1.2 Document `TWILIO_NUMBER_COUNTRY` in `.env.example` next to the other Twilio vars and change the "auto-purchases a US number" comment to say the configured country (default Israel); verify the file reads correctly

## 2. Purchase by country

- [x] 2.1 Add the pure helper `numberSearchPlan(country)` in src/twilio/provision.ts (ordered number types: mobile, then local) with a unit test in tests/numberSearchPlan.test.ts; verify `npm test` passes
- [x] 2.2 Make `provisionWhatsAppNumber` loop over the plan for `env.TWILIO_NUMBER_COUNTRY`, buy the first SMS-capable candidate, and throw "Twilio has no <country> numbers available for purchase right now." when every type is empty; update the function's doc comment; verify `npm run typecheck` passes

## 3. Verification

- [ ] 3.1 Live check (owner): in the admin panel press "buy number" on a test agent with the default country and confirm the assigned number starts with +972, the sender reaches ONLINE, and a WhatsApp message from the agent arrives; then release the number from the admin panel to stop the rent
- [x] 3.2 Commit per the repo Git workflow (pull --rebase, typecheck, commit, push)
