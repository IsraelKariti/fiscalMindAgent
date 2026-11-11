## 1. Baseline

- [ ] 1.1 SKIPPED by the owner on 2026-11-11 (cost ~$15 per run on gpt-6-astra). Run the planner evals with the configured models before touching the prompt (`/run-evals`, stage planner) and keep the report as the baseline; verify: `evals/results/latest.json` exists with a planner section dated today.

## 2. Static system prompt

- [x] 2.1 In `src/agents/declarationOfCapital/prompt.ts` add `PLATFORM_SECTIONS.runContext = 'RUN CONTEXT'` and `buildRunContextSection(token, client, accountant, history, now)` that renders the fenced section: accountant name, client name + WhatsApp number, engagement start date, now (UTC), now local with the timezone name, time since last message (or "none sent yet"), then the calendar instruction sentence and `formatUpcomingDates(now, env.ACCOUNTANT_TIMEZONE)`; reuse `formatLocalDateTime`/`humanizeDuration`; verify: new test `tests/runContextSection.test.ts` asserts every line and that the section is the first thing in `buildPrompt(...).contents`.
- [x] 2.2 Reduce `buildSystemPrompt` to `(taxYear?: number)`: render `prompt.md` with `tax_year` only, append `KEEPALIVE_CONTRACT` and the doctrine; set `PROMPT_PLACEHOLDERS = ['tax_year']`; place `buildRunContextSection` first in `buildPrompt`'s `sections`; keep `buildPrompt`'s signature; verify: `npm run typecheck` passes and a test asserts `buildPrompt(...).systemInstruction` is identical for two clients of different accountants with different `now` values and contains neither name, phone, nor an ISO timestamp.
- [x] 2.3 Edit `src/agents/declarationOfCapital/prompt.md`: line 1 and line 134 refer to the accountant named in RUN CONTEXT; line 5 refers to the client, number and start date given in RUN CONTEXT; line 171 "later than the local time stated in RUN CONTEXT"; delete lines 173-178 (clock + calendar, the calendar sentence moves into the section in 2.1); verify: `grep -c "{{" prompt.md` counts only `tax_year` placeholders, and the test of 2.2 passes.

## 3. Doctrine without the token

- [x] 3.1 Change `buildUntrustedDataDoctrine(platformSections)` in `src/agents/shared/promptSafety.ts` to name the token as the code inside the square brackets of the first line of the input instead of printing it; update the callers (`prompt.ts`, `src/gemini/llmStages.ts`) and `tests/promptSafety.test.ts`; verify: `npm test` passes and the doctrine text contains no hex token.

## 4. Admin stage page and docs

- [x] 4.1 Update the planner entry in `src/gemini/llmStages.ts` (query description starts with `--- RUN CONTEXT [{{token}}] ---`, system prompt variant no longer takes a token) and `tests/llmStages.test.ts` if it asserts placeholders; verify: `#/llm-stages` planner card lists only `tax_year` under placeholders.
- [x] 4.2 Update `docs/agents.md` (prompt placeholders paragraph, `{{upcoming_dates}}` mention → RUN CONTEXT section) and `docs/pipeline.md` row "Build the prompt" to name `buildRunContextSection`; verify: `grep -n "upcoming_dates" docs/*.md` shows only the new wording.

## 5. Verification

- [x] 5.1 Done 2026-11-11 (owner asked after all): 30/39 pass on gpt-6-astra (run-planner-prompt-cache-order.json, $5.97, 71% of input tokens cached); the 9 failing cases re-run on the old prompt (run-planner-old-prompt-compare.json): 8 fail the same way there (pre-existing: 5× file tied under follow_up instead of collect, 2× no conclude, dec_30 vehicle cost, dec_38 template), dec_29 passed on the old prompt (message wording, model variance). No regression. Run the planner evals again with the configured models and compare with the baseline of 1.1; verify: no case flips from pass to fail; sample replies still address the client by first name and introduce the assistant with the accountant's name.
- [x] 5.2 Cache check on gpt-6-astra: trigger two planner calls within a few minutes (a test client message twice, or the scratch script `cache-exp/run.mjs` variant H with a freshly stored request); verify: the second `llm_calls` row has `cached_tokens` ≥ 15,000 and the admin cost tab shows the lower per-call cost. Done 2026-11-11 with the scratch script: two different clients, second call 21,269 of 22,244 tokens cached.
- [x] 5.3 Commit per the Git workflow (`git pull --rebase`, `npm run typecheck`, commit, push); verify: `git log -1` shows the commit on origin/master.
