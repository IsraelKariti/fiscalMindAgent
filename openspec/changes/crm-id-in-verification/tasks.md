## 1. Recognise the CRM card's id

- [x] 1.1 `kickoff.ts`: replace `findIdNumber` with an exported pure `crmIdNumber(columns)` (broader `ID_TITLE`: Hebrew variants and English `id` / `id number` / `national id` / `identity` as words, excluding titles containing `item`, `board`, `monday`, `pulse`; digits ≥ 5; prefer the checksum-valid candidate). Keep both kickoff call sites using it. Verify with a new `tests/kickoffIdNumber.test.ts`: "id" → stored; "מס' זהות" (bad checksum) + "ת.ז" (good) → the good one; only "phone" / "Email" / "item id" → null.

## 2. Verification uses the CRM id

- [x] 2.1 `verifyChecks.ts`: `CheckContext.credentialIdSource`; `id_matches_client.expected` carries `(credentials)` / `(monday CRM)`; when the document prints an id and none is on file, add `client_id_on_file` (failed, observed `none`, Hebrew note) and exclude it from the verdict. Verify in `tests/verifyChecks.test.ts`: source suffix present; the no-id case reports `client_id_on_file` failed while `passed` stays true; `id_matches_client` absent in that case.
- [x] 2.2 `verifyDocument.ts`: when credentials and `agent_fields.id_number` are both empty and `monday_crm_item_id` is set, fetch the CRM card with the accountant's monday token, apply `crmIdNumber`, store via `clients.setDeclarationEngagement`, and pass the id + source into `runChecks`; failures only log. Verify by running one verification for the test client (re-send its bank document): the `verify_extraction` row now carries `id_matches_client` with "(monday CRM)" in its expected value, and `agent_fields.id_number` is set afterwards (`SELECT agent_fields ? 'id_number' FROM clients WHERE id = '<client>'`).

## 3. UI, docs, delivery

- [x] 3.1 `web/src/i18n.tsx`: Hebrew label for `client_id_on_file`. Verify the modal shows it for a row that carries it (or that the label key exists and the web typecheck passes).
- [x] 3.2 `docs/agents.md`: kickoff paragraph (id recognition rule, verification fallback) and the code-gates paragraph (`client_id_on_file`, source suffix). Verify by reading the diff.
- [x] 3.3 Run `npm test` and `npm run typecheck`; commit and push per the repo git workflow. Verify the push lands on `origin/master`.
