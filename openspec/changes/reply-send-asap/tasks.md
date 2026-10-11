## 1. Decision gate and delay

- [x] 1.1 In `src/agents/declarationOfCapital/decisionSchema.ts`, accept `send_at: "asap"` (trimmed, lower-case) on `follow_up` next to the wall-clock form; update the zod field comment and the corrected-answer hint ("a future send_at or asap"); verify with new cases in `tests/decisionKeepalive.test.ts` (follow_up + asap passes, collect + asap is rejected with the "leave send_at null" message) — `npm test`.
- [x] 1.2 Add `resolveSendAt(sendAt, now, timeZone)` to `src/agents/shared/sendAtGuard.ts` (`asap` → now + 1 s with its wall-clock label to the second; a time → the zoned conversion) and verify in `tests/sendAtGuard.test.ts` that `asap` yields an instant exactly 1 s after `now`, a wall-clock time keeps today's conversion, and `rollBlockedSendAt('asap', …)` returns it unchanged with `rolled: false`.
- [x] 1.3 In `scheduleReply` (`src/agents/declarationOfCapital/plan.ts`), call `resolveSendAt` after the blocked-day guard, compute `delayMs` from the returned instant as today, and record `send_at` (the picked time) plus `requested: 'asap'` in the `send_reply` step detail, the attestation request detail and the "follow-up scheduled" log; verify with `npm run typecheck` and by reading a local `send_reply` step (`npm run step`) after a manual planner run that answered `asap`.

## 2. Prompt

- [x] 2.1 Rewrite the momentum paragraph of "קביעת send_at" in `src/agents/declarationOfCapital/prompt.md` into the two lists of design decision 5 (when to answer `asap`, when to pick a time), and name `asap` as the second allowed form in the `send_at` format line of the follow_up section; verify the rendered prompt still passes the prompt fixtures (`npm test`) and reads correctly in the #/llm-stages page.
- [x] 2.2 Update the keep-alive contract line in `src/agents/declarationOfCapital/prompt.ts` ("send_at עתידי" → time or `asap`) and the window line in `buildWhatsAppSection` ("send_at must be before that" → also allows `asap`); verify with `npm run typecheck`.

## 3. Evals

- [x] 3.1 In `evals/stages.ts`, let the `send_at_future` check pass for `asap`, add the optional `send_asap: boolean` expectation with its own check, and update the judge text in `evals/cases/generate_message.json`; verify `npm run evals -- --stage generate_message --rejudge` keeps every existing case's result.
- [x] 3.2 Through the `add-eval-case` skill, add a case where the client wrote a minute ago asking which document is needed (`send_asap: true`) and a case where the client wrote "I'm looking for the document now, will send soon" (`send_asap: false`); verify both pass with the configured model and restore unchanged synthetic PDFs before committing.

## 4. Docs and commit

- [x] 4.1 Update the `send_reply` row in `docs/pipeline.md` and the blocked-day guard paragraph in `docs/agents.md` to mention the `asap` marker and `resolveSendAt`; verify the docs name the real function.
- [ ] 4.2 `git pull --rebase origin master`, `npm run typecheck`, `npm test`, commit, push (per repo Git workflow); verify the push lands on master.
