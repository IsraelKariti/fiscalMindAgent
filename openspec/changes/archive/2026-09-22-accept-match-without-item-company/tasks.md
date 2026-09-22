## 1. Shared rule

- [x] 1.1 In `src/agents/declarationOfCapital/institutions.ts`, make `tieAllowedByCompany` return true for `item_unidentified` regardless of evidence (only `file_unidentified` still needs it); update its doc comment. Verify: `tests/institutions.test.ts` — the `tieAllowedByCompany` cases assert `item_unidentified` → true with and without evidence, `file_unidentified` → evidence only, `different` → false.

## 2. File check gate

- [x] 2.1 In `src/agents/declarationOfCapital/analyzeFileRules.ts`, decide the `issuer_matches_item` check with `tieAllowedByCompany(comparison, false)`: `same` passes as today; `item_unidentified` passes with no note (the `code-gates` contract), `expected: 'not identified'`, observed the file's company, `match_dropped` untouched; `different` / `file_unidentified` drop as today. Update the function's doc comment (rule 3). Verify: `tests/analyzeFileRules.test.ts` — replace the "item that names no company drops the match" case with one that asserts the match is kept, `result === true`, `match_dropped` undefined/null and the check passed with expected "not identified"; keep the "different companies" and "file company not identified" drop cases green.

## 3. Planner ties

- [x] 3.1 In `src/agents/declarationOfCapital/fileTies.ts`, make `companyRefusal` refuse with `type_differs` when the verdict is `item_unidentified` and `file.analysis?.document_type !== doc.type_key`, and otherwise allow it (no evidence needed); `file_unidentified` without evidence still returns `company_unidentified_no_client_quote`. Update the module and function comments. Verify: `tests/fileTies.test.ts` — `companyRefusal` cases: unnamed-company item + same type → null with and without evidence; unnamed-company item + other type → `type_differs`; unknown issuer without quote → `company_unidentified_no_client_quote`; `filterPairsByCompany` expectations updated to match.
- [x] 3.2 Update the comment above `filterPairsByCompany` in `src/agents/declarationOfCapital/plan.ts` (a pair with an item that names no company is accepted on type). Verify: `npm run typecheck` and `npm test` pass.

## 4. Docs

- [x] 4.1 In `docs/agents.md`, rule 2 of the unlisted-files section and the `filterPairsByCompany` paragraph: state the new rule (item names no company → kept on type agreement; file company unknown → client's words; different → never) and the known limit that a person-named item can collect files from several companies. Verify: the section reads consistently with the delta spec.

## 5. Check on the observed client

- [ ] 5.1 With the local stack running, run the planner for client "ניב" (local id `bb839f0c-…`) after the client's confirmation, or resend one of the split children, and confirm that the study fund / pension / insurance items turn received with files attached and no `item company not identified` refusal appears in the trace. Verify: the workspace documents tab and the step trace.
