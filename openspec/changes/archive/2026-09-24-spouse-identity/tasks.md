## 1. Spouse record and cell recognition

- [x] 1.1 Add `src/agents/declarationOfCapital/spouseIdentity.ts` with the `SpouseOnFile` / `MaritalStatus` types, `readSpouse(agentFields)` (tolerant parser) and `mergeSpouse(current, incoming, trust)` (questionnaire > crm > document; equal or lower trust never overwrites a present value); verify with a new `tests/spouseIdentity.test.ts` covering the precedence table and garbled input.
- [x] 1.2 Extend `crmIdentity.ts` with `SPOUSE_TITLE`, `crmSpouse(columns)` (id when the title also names an id and ≥5 digits, checksum-valid preferred; name when no id title and ≥2 letters) and `crmMaritalStatus(columns)`; make `crmIdNumber` skip spouse-titled cells; verify in `tests/kickoffIdNumber.test.ts` (the "ת"ז" + "ת"ז בן/בת זוג" pair, every listed title/value form, married / not married / unknown values).
- [x] 1.3 Extend `clients.setDeclarationEngagement` with `spouse` and `maritalStatus` (JSONB merge into `agent_fields.spouse` / `agent_fields.marital_status`); verify with `npm run typecheck` and by reading a patched row back in a quick script.
- [x] 1.4 In `kickoff.ts`, read the three cell readers on the questionnaire columns first and the CRM columns second, merge with 1.1 against the client's current spouse at enrollment and on every re-fired kickoff, and name the spouse (name + masked id) and the marital status in the kickoff audit detail; verify with a unit test on the extracted pure merge step and by re-firing the local kickoff for the test client and reading `agent_fields`.

## 2. Verification against client + spouse

- [x] 2.1 Add `resolveSubjectIdentity(fields, ctx)` to `spouseIdentity.ts` implementing design D3 (client → spouse → checksum → third person → not married → name contradiction → adopt), returning `matched`, `adopt` and the `subject` / `id_matches_client` / `spouse_adopted` / `client_id_on_file` entries with the `expected` wording from design D6; verify with unit tests for every branch (each scenario of the `spouse-identity` and `code-gates` deltas), including masking of every id.
- [x] 2.2 Wire it into `verifyChecks.runChecks`: `CheckContext` gains `spouse` and `maritalStatus`, `ChecksVerdict` gains `adoptSpouse`; keep `id_checksum` as is; verify existing `tests/verifyChecks.test.ts` still passes and add the spouse cases there (spouse id on file passes, name-only spouse document passes `subject`, third person fails `subject` and `id_matches_client`).
- [x] 2.3 In `verifyDocument.ts`, re-read the client (`clients.getById`) at the start of each verification, pass the spouse + marital status into the checks, persist `adoptSpouse` through `mergeSpouse` + `setDeclarationEngagement`, record `client.spouse_inferred` (masked id, name, documentId, fileId) and publish the client update; add `subject_matched` to the `verify_extraction` detail; verify with a two-document batch test on the pure batch runner plus a local run: collect the wife's pension for the test client and confirm the trace shows `spouse_adopted`, the record holds her, and a second document of hers passes without a second adoption.
- [x] 2.4 Add the i18n labels for `spouse_adopted` and the widened `id_matches_client` text, and the `client.spouse_inferred` action label where audit actions are labelled; verify by opening the `verify_extraction` step modal of the local run and the audit page.

## 3. Planner awareness

- [x] 3.1 Add `buildClientIdentitySection` to `prompt.ts` (name, id on file yes/no, marital status + source, spouse name / "name unknown" / "none on file", id known + source — never digits), register the block name in `PLATFORM_SECTIONS`, place it after the documents section in `buildPrompt`; verify with `tests/` unit tests for the three states (married + inferred spouse, nothing known, spouse from questionnaire without id) and by checking `#/llm-stages` shows the block.
- [x] 3.2 Add the household rules to `prompt.md` (spouse assets belong to the declaration; spouse-owned instances carry the spouse's name; tie by the printed holder when two same-type same-company instances exist; never ask for an id number); verify with `npm run evals -- --stage generate_message` unchanged or better and by reading the rendered prompt of the test client.

## 4. Evals and workspace

- [x] 4.1 Extend the extraction eval adapter (`evals/stages.ts`): `client.spouse` + `client.maritalStatus` in the case shape, passed to `runChecks`, and the `subject_name_matches` rule widened to the spouse; add two cases on an existing synthetic PDF (spouse id matches; third person expects `id_matches_client` among `failed_keys`) with `/add-eval-case`; verify with `npm run evals:rejudge` and no regen of unchanged PDFs.
- [x] 4.2 Show the spouse line on the capital documents card (name / "name unknown", masked id, sources, marital status; absent when nothing is known); verify in the browser on the test client after 2.3.

## 5. Docs and close

- [x] 5.1 Document the spouse record, sources, precedence, the identity rule and the new check/audit keys in `docs/agents.md` (next to the kickoff and verification paragraphs); verify the section reads consistently with the delta specs.
- [x] 5.2 Run `npm test`, `npm run typecheck`, `npm run evals:rejudge`; re-collect the wife's stalled pension document for the local test client and confirm the only remaining failure is the account-number `type_fields` check; commit per the repo git workflow.
