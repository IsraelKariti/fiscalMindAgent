## Why

The `verify_extraction` gate compares the id printed on a document with the id on file for the client only when one is on file. For clients enrolled by the monday kickoff, the id comes from the linked CRM card, but the kickoff recognises the id cell by a narrow set of Hebrew titles (`מספר זהות`, `תעודת זהות`, `ת"ז`). The test client's CRM card holds it under the title "id", so nothing was stored and the check never ran (the 13:12 `verify_extraction` row shows `id_checksum` but no `id_matches_client`). The accountant expects every verified document to be checked against the id they keep on the monday CRM card.

## What Changes

- The kickoff recognises the CRM card's id cell by more titles (Hebrew variants such as `ת.ז`, `תז`, `מס' זהות`, and English `id`, `id number`, `national id`, `identity`), and when several cells qualify prefers the one whose digits pass the Israeli id checksum.
- When a document is verified and the client has no id on file but has a linked CRM card, the verification fetches the card, stores the id on the client, and uses it — so clients enrolled before this change get the comparison too, without re-firing the webhook.
- The `verify_extraction` gate reports the id comparison whenever the document prints an id and an id is on file (unchanged rule), and its checks carry where the id on file came from (tax-portal credentials or the monday CRM card). When the document prints an id and the client has none on file at all, the gate reports a `client_id_on_file` check that fails with a note naming the CRM card, without changing the verdict (reported alongside, like the classification quarantine checks) — so the admin sees why no comparison happened.

## Capabilities

### New Capabilities
- `declaration-kickoff`: how the monday kickoff and its refresh read the client's identity from the linked CRM card (phone, name, id), including which cell counts as the id.

### Modified Capabilities
- `code-gates`: the `verify_extraction` checks — `id_matches_client` gains its source, and the new `client_id_on_file` check when the document prints an id but none is on file.

## Impact

- Backend: `src/agents/declarationOfCapital/kickoff.ts` (`findIdNumber` → exported, pure, broader titles + checksum preference), `verifyChecks.ts` (`CheckContext.credentialIdSource`, `client_id_on_file`), `verifyDocument.ts` (CRM fallback: `fetchItemDetails` + `clients.setDeclarationEngagement`), `src/agents/shared/mondayData.ts` unchanged.
- Tests: new `tests/kickoffIdNumber.test.ts`; `tests/verifyChecks.test.ts` extended.
- Frontend: `web/src/i18n.tsx` label for `client_id_on_file`. No API or schema change; no migration.
- Docs: `docs/agents.md` kickoff and code-gates paragraphs.
