## 1. Data

- [x] 1.1 Add `listUnsentDraftsForClient(clientId, after, limit)` to `src/db/queries/emails.ts` (outbound, `status IN ('draft','held')`, `created_at > after` when given, newest `limit`, returned oldest first); verify with `npm run typecheck` and a scratch query on client `b49e84a5` that returns the expected draft rows

## 2. Prompt

- [x] 2.1 Add `buildUnsentDraftsSection(token, drafts)` to `src/agents/declarationOfCapital/prompt.ts` per design decision 4 (label, per-entry NOT DELIVERED reason, 1,500-char cap with truncation marker, fence-safe body, empty string for no drafts); verify with new unit tests in `tests/` covering: empty list, superseded entry, held entry, truncation, a body containing a fence line
- [x] 2.2 Add the optional `unsentDrafts` parameter to `buildPrompt` and place the section directly before the thread; verify by unit test that the block appears before `MESSAGE THREAD`, and that the thread section is byte-identical with and without drafts
- [x] 2.3 Add the instruction paragraph to `src/agents/declarationOfCapital/prompt.md` (design decision 6); verify the built system prompt contains it and `npm run build` copies the asset
- [x] 2.4 Update the `generate_message` stage description in `src/gemini/llmStages.ts` to list the new block; verify on `#/llm-stages`

## 3. Planner wiring

- [x] 3.1 In `planFollowUp` (`plan.ts`) compute the last delivered outbound `sent_at` from `history`, load up to 5 unsent drafts after it, and pass them to `buildPrompt`; leave `history`, `inboundTexts`, `confirmableMessageIds` and the WhatsApp/tax-fetch inputs untouched; verify with `npm run typecheck` and `npm test`
- [ ] 3.2 Verify end to end on the dev stack (user runs it): trigger a replan for client `b49e84a5`, open the newest `generate_message` call in the admin call browser, and confirm the request shows the unsent-drafts block with the expected drafts and an unchanged thread

## 4. Evals

- [x] 4.1 Add optional `unsent_drafts` to the decide-case input in `evals/stages.ts` and pass the mapped rows to `buildPrompt`; verify existing cases still load and run unchanged
- [x] 4.2 Add a `generate_message` case reproducing the 2026-09-18 burst (use the `add-eval-case` skill): last client message names two new pension funds, assert `added_instances` holds two instances on a pension anchor; verify by running the case with `run-evals` and record the pass rate in the change notes

## 5. Wrap-up

- [x] 5.1 Run `npm run typecheck` and `npm test`, then commit and push per the repo Git workflow

## Notes

- 4.2 (2026-09-18): `dec_08` on `gemini-3.1-pro-preview` with the new prompt: 4/4 runs pass (both Meitav and Menora added as pension instances). No baseline was measured against the old prompt, so this does not prove the change caused the pass. To judge the new expectation the case needed a new code check, `expects.added_instances` (count per catalog type), added to `evals/stages.ts`.
