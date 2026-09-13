## Context

- `kickoff.ts` resolves the declarations-board row to the linked CRM card (`crmLinkColumnId` → `fetchItemDetails`) and reads phone, name and id from it. `findIdNumber` is a private helper matching column titles against `ID_TITLE = /מספר זהות|תעודת זהות|^ת\.?["”״׳']?ז\.?$/i` and requiring five or more digits. The test client's card has `[text] "id"`, so nothing was stored. Re-fired webhooks refresh the id via `clients.setDeclarationEngagement({ idNumber })`.
- `verifyDocument.ts` builds the `CheckContext` with `credentialIdNumber = credentials?.id_number ?? agent_fields.id_number` and calls the pure `runChecks`; `id_matches_client` runs only when both the document and the context carry an id. The verification path already has the client row and can reach monday through `mondayOauthTokens.getByUserId(client.user_id)`.
- The audit rule "no raw ID numbers in detail" holds: check values use `maskId`.

## Goals / Non-Goals

**Goals:**
- Every declaration client whose CRM card holds an id gets it on file, whether enrolled before or after this change.
- The gate row tells the admin where the id on file came from, or that there was none to compare.

**Non-Goals:**
- Mapping an id column on the declarations board itself, or on Google Sheets sources (their `idNumberColumn` remains a credentials pair with the user code).
- Changing the verdict for clients without an id on file: `client_id_on_file` is reported, not enforced. Enforcing it would stall every document of a client whose CRM card lacks an id — an accountant decision, not a code one.

## Decisions

1. **`findIdNumber` becomes an exported pure function `crmIdNumber(columns)` in `kickoff.ts`** (kept in that module — it is the CRM-reading module — but importable by `verifyDocument.ts` and tests). Rule: candidate = text-bearing column whose title matches `ID_TITLE`; digits ≥ 5; prefer the candidate whose digits pass `isValidIsraeliId`, else the first. Title regex: Hebrew `מספר זהות|תעודת זהות|זהות|ת\.?["”״׳']?ז\.?` anywhere, English `\b(id|id number|national id|identity)\b` — with `item id` / `board id`-style titles excluded by rejecting titles that contain `item`, `board`, `monday`, `pulse`. Alternative considered: value-only detection (any 9-digit checksum-valid cell) — rejected because a tax file number or phone fragment can pass the checksum by chance; the title must name an id.
2. **CRM fallback at verification, with write-back.** In `verifyDocument.ts`, when neither credentials nor `agent_fields.id_number` yield an id and `agent_fields.monday_crm_item_id` is a string: get the accountant's monday token; if present, `fetchItemDetails`, run `crmIdNumber`, and on a hit `clients.setDeclarationEngagement(client.id, { idNumber })` then use it. Wrapped in try/catch with a warning log — verification never fails on monday. One monday call per verification of an id-less client, and only until the id is stored. Alternative considered: a one-off backfill migration script — rejected because the daily import scan does not refresh CRM data and a new CRM card edit would still need this path.
3. **`CheckContext` gains `credentialIdSource: 'credentials' | 'monday_crm' | null`**; `runChecks` appends `(credentials)` / `(monday CRM)` to `id_matches_client.expected`. When the document prints an id and `credentialIdNumber` is null, `runChecks` adds `client_id_on_file` failed with observed `none` — and excludes it from the verdict (`passed` is computed over checks other than `client_id_on_file`). Rationale: the modal's promise is "what was compared and why it failed"; a silent absence hides the gap the user just hit. Alternative: leave the check absent (today) — rejected for exactly that reason.
4. **Labels**: `gateCheckLabels.client_id_on_file` in `i18n.tsx`; the `id_matches_client` label unchanged.

## Risks / Trade-offs

- [A broader title match could pick a wrong column, e.g. "Customer ID" from a CRM export] → checksum preference among candidates, and the `item|board|monday|pulse` exclusion; the expected value in the gate row shows the masked digits and the source, so a wrong pick is visible.
- [Verification now may call monday] → one call, only for id-less clients with a CRM link, failure-tolerant; the token lookup is the same query the kickoff uses.
- [`client_id_on_file` shows ✗ on a passed gate] → precedent exists (classification quarantine checks); the note explains it does not affect the verdict.

## Migration Plan

- No migration. Deploy backend and frontend together. Existing clients pick up the id on their next verification (decision 2) or on a re-fired kickoff.
- Rollback: revert; stored `agent_fields.id_number` values remain valid data.
