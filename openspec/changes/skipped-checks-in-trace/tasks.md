## 1. Server: skipped check entries

- [x] 1.1 In `src/agents/declarationOfCapital/verifyChecks.ts` change `CheckResult.passed` to `boolean | null`, add the `skipped(key, whyHe)` helper and the fixed Hebrew skip reasons (design D2, D4); verify `npm run typecheck` passes.
- [x] 1.2 Make `notExpiredCheck` and `periodCoversValuationDateCheck` return a skipped entry instead of `null`, and make `verdictOf` take `CheckResult[]`, judge only entries with `passed !== null`, and return the full list; verify with a unit test that a vehicle answer with `valid_until: null` yields `not_expired` with `passed: null` and the skip note, and that a contents-insurance answer with no `period_to` yields `period_covers_valuation_date` skipped while `type_fields` fails.
- [x] 1.3 In `identityChecks` insert skipped entries for every missing identity key in the fixed order `subject, id_checksum, id_matches_client, client_id_on_file, spouse_adopted, co_owners`, with the reason chosen per design D4; verify with unit tests: no printed id → three skipped with the "no owner prints an id" note; printed id but nothing on file → `client_id_on_file` failed and `id_matches_client` skipped with the "no id on file" note; adopted spouse → `co_owners` skipped; client matched with co-owner → `spouse_adopted` skipped.
- [x] 1.4 Update `tests/documentTypes.test.ts` and `tests/spouseIdentity.test.ts` where they assert exact key lists (bank balance eleven keys in order; prior declaration `legible, expected_type, subject` plus the five identity entries); verify `npm test` passes.
- [x] 1.5 Confirm `verifyDocument.ts` copies `passed: null` into `detail.checks` unchanged and that `verdict.reasons` and the planner's failure text contain no skipped entry; grep `src/`, `tests/`, `evals/` for `.passed` and fix any `!c.passed` that would count a skipped check as failed; verify `npm run typecheck` and `npm test`.
- [x] 1.6 Document the nullable `passed` on `GateCheck` in `src/agents/shared/gateChecks.ts` (comment only, `check()` stays boolean); verify `npm run typecheck`.

## 2. Web: render skipped checks

- [x] 2.1 In `web/src/components/StepDetailModal.tsx` make `GateCheckView.passed` `boolean | null`, let `isGateCheckList` accept `null`, and render a skipped entry with class `gate-check-skip`, glyph "–", screen-reader text `t.gateCheckSkipped`, and its note in the muted skip style; verify in the browser that the step `f5eac630-1081-4416-9eff-634f698f38e7` shows eleven checks with five dashes and their reasons.
- [x] 2.2 Add the ran/skipped count to the checks heading when at least one check is skipped (`t.gateChecksCount(ran, skipped)` → "6 נבדקו · 5 לא נבדקו"); verify the same step shows the heading and an older `verify_extraction` row shows the plain heading.
- [x] 2.3 Add `gateCheckSkipped: 'לא נבדק'` and the count string to `web/src/i18n.tsx`, and the `.gate-check-skip` glyph and note styles to `web/src/styles.css` (neutral gray, no red background); verify `npm run typecheck` and a visual check in both themes.
- [x] 2.4 Confirm "copy details" on the same step includes the skipped entries with `passed: null` (no code change expected); verify by pasting the copied text.

## 3. Docs and review

- [x] 3.1 Update the verification paragraph in `docs/agents.md` to say a `verify_extraction` row lists every check of the type, skipped ones with `passed: null` and a reason; verify by reading the paragraph.
- [x] 3.2 Reword the Notion "verify_extraction" gate page intro so it says a check that does not apply appears in the trace as "לא נבדק" with its reason (follow `STYLE.md`; the per-type check pages' "Runs: only when …" lines stay as they are); verify by opening the page.
- [x] 3.3 Run `npm run typecheck`, `npm test` and `npm run evals -- --rejudge` (stored outputs only, no model calls) and confirm no eval case changed its verdict; then commit per the repo Git workflow.
