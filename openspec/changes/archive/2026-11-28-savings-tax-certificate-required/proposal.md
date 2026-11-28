## Why

A client's pension documents were marked as collected although none of them carried the line "אישור מס להצהרת הון". Today the pension and study fund rules accept two forms as equal — the dedicated certificate, or the year-end balance page of the short annual report — so a report with a balance and no certificate passes. The owner's rule (2026-11-28) is that the document MUST contain the tax certificate for the capital declaration; a report without it is not eligible.

## What Changes

- **BREAKING** (acceptance rule): a file for a pension/provident item or a study fund item is approved only when the document prints the heading "אישור מס להצהרת הון". The year-end balance page of an annual report alone is no longer an accepted form.
- The extraction reads one new field for these two types: the certificate heading, quoted as printed. Code decides on it; a missing heading fails the existing `type_fields` check with a clear Hebrew note.
- An annual report that includes the certificate (often its last page) is still accepted, and its balance and deposits are read as before.
- The wording the classifier, the planner and the client see for these two types asks for the certificate only. The agent no longer offers the short annual report as an equal alternative for them, and after a rejection it tells the client what is missing.
- Assumptions recorded here, to be corrected in review if wrong:
  - Life-insurance savings (`life_insurance_savings`) follows the same rule (owner's decision, 2026-11-28, after the first two types were built): the certificate is a must, a balance-only report is not accepted.
  - The words are matched as two groups, "אישור מס" and "הצהרת הון", so "אישור מס והצהרת הון" also counts. A heading with only "אישור מס עבור קרן השתלמות" and no "הצהרת הון" anywhere does not count.
  - Items already approved are not re-judged. The owner reopens the affected client's items by hand.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `document-extraction`: pension/provident and study fund gain a required certificate-heading field; a new requirement says these two types are approved only with the tax certificate for the capital declaration, and that their wording asks for it.

## Impact

- `src/agents/declarationOfCapital/documentTypes/pensionProvident.ts`, `studyFund.ts`: schema, prompt, fields.
- `src/agents/declarationOfCapital/catalog.ts`: the three type descriptions and the one savings hint the three types share.
- `src/agents/declarationOfCapital/prompt.md`: the savings special-case block.
- Tests and fixtures: `tests/documentTypes.test.ts`, `tests/fixtures/extractionCalls/pension_provident.json`, `study_fund.json`.
- Evals: `evals/cases/extract_document.json` (new rejected case, updated expected fields), `evals/make-files.ts` (one balance-only report).
- Docs: `docs/agents.md` (savings-family paragraph), the Notion extraction child pages for the two types.
- Document fetch: files pulled from fund sites go through the same check. A provider whose download lacks the certificate will now produce a rejected file (see design, risks).
- No database migration. No API change.
