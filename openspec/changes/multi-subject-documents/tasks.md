## 1. Extraction contract

- [x] 1.1 In `verifyChecks.ts`, replace `subject_name` / `subject_id_number` with `parties` (name, id_number, role) in `ExtractedFields`, `ExtractionSchema` and `EXTRACTION_PROMPT` (design D1: one entry per person, id beside its own name, never join names, roles owner / counterparty / other, max 10); verify with `npm run typecheck` and by printing `extractionJsonSchemaFor(undefined)` to see `parties` in the schema and no `subject_*` key.
- [x] 1.2 Run `scripts/verifyExtractionSample.ts` (or the extraction eval for one case) on the local contract file of client "ניב" and confirm the model returns four parties, two `owner` buyers and two `counterparty` sellers, each with its own id; adjust the prompt wording until it does.

## 2. Identity over the owner parties

- [x] 2.1 In `spouseIdentity.ts`, split `resolveSubjectIdentity` into `resolveParty` (chart B for one person: client / spouse / adoptable / nobody / uncompared, with the reason) and `resolveDocumentOwners` (owners only, per-party resolution, `matched` = client / spouse / both / null, co-owners, the check entries of design D4); add `chooseSpouseToAdopt` (design D3: one candidate, and either one owner or a spouse name on file that the candidate matches); verify with `tests/spouseIdentity.test.ts` covering every scenario of the `spouse-identity` delta (four-party contract with and without a spouse name, joint account with a third person, only strangers, two adoptable strangers, sellers' ids only, joint owners without ids, plus every existing single-owner scenario).
- [x] 2.2 Wire it into `runChecks`: `id_checksum` over every owner id, `subject` / `id_matches_client` / `spouse_adopted` / `co_owners` / `client_id_on_file` from `resolveDocumentOwners`, `subjectMatched` gains `both`; verify with `tests/verifyChecks.test.ts` (existing cases rewritten to `parties`, plus the `code-gates` delta scenarios: four-party contract accepted with a co-owner, adoption by the name on file, one owner's id fails the checksum).
- [x] 2.3 In `verifyDocument.ts`, add `parties` (name, role, masked id, resolved) to the `verify_extraction` detail and let `subject_matched` carry `both`; keep `adoptSpouseFromDocument` as is (it already stores one id and one name); verify with `npm run typecheck` and a local run after task 4.3.

## 3. Trace and labels

- [x] 3.1 Add the i18n labels for `co_owners`, for `subject_matched` = `both`, and for the parties list (roles and resolutions) in `web/src/i18n.tsx`; render the parties list in the `verify_extraction` step modal under the checks, tolerant of old rows without it; verify by opening an old step and a new step in the browser.

## 4. Evals

- [x] 4.1 In `evals/stages.ts`, replace `expected.subject_id_number` with `expected.owner_ids` (order-free digits), compute `subject_name_matches` through `resolveDocumentOwners`, add `expected.verdict.adopted`; rewrite every `extract_document` case that states `subject_id_number`; verify with `npm run evals:rejudge` on the latest run (the old results keep their keys; only the judge changes).
- [x] 4.2 Add `contract_four_parties.pdf`, `contract_sellers_ids_only.pdf` and `joint_bank.pdf` to `evals/make-files.ts` and the four cases of design D6 with `/add-eval-case`; restore every unchanged PDF after `npm run evals:files` (memory: regen churn); verify with `npm run evals -- --stage extract_document --models <local model>` that the new cases pass and no existing case regresses.
- [x] 4.3 Clear the wrong spouse of the local test client "ניב" (`agent_fields.spouse` → null), re-collect the contract file, and confirm in the trace: `subject` passed as the client, `co_owners` lists "תמיר מיכל", no `spouse_adopted`, the sellers only in the parties list; then put the spouse name on the record and re-collect to see the adoption of her id alone.

## 5. Docs and close

- [x] 5.1 Update `docs/agents.md` (identity rule over owner parties, co-owners, adoption rule) and `docs/pipeline.md` (step 7 now names `resolveDocumentOwners` → `resolveParty` → `chooseSpouseToAdopt`); update the Notion page "verify_extraction" under Code gates per `STYLE.md`, and chart B of the "Document Approval Flow" artifact (a parties loop before step 1, the co-owner outcome, the multi-owner adoption rule); verify the three read consistently with the delta specs.
- [x] 5.2 Run `npm test`, `npm run typecheck`, `npm run evals:rejudge`; commit per the repo git workflow.
