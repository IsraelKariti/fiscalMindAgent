## 1. Extraction contract of the two fund types

- [x] 1.1 In `documentTypes/pensionProvident.ts` add `tax_certificate_title` (text, required, pattern for "אישור מס" + "הצהרת הון", Hebrew hint) as the first type field, to the zod schema and to the prompt (one instruction line: quote the heading as printed, null when absent, never from the file name or the item name); rewrite the accepted-forms paragraph to one form. Verify: `npm test -- documentTypes` passes the prompt/schema agreement test for the type.
- [x] 1.2 Do the same in `documentTypes/studyFund.ts` (keep CRLF line endings in both modules). Verify: same test passes for `study_fund`.
- [x] 1.3 Add unit tests in `tests/documentTypes.test.ts`: null title fails `type_fields` with the certificate note; "אישור מס להצהרת הון" and "אישור מס והצהרת הון" pass; "אישור מס שנתי" fails; `life_insurance_savings` has no such field. Verify: the new tests pass.
- [x] 1.4 Regenerate `tests/fixtures/extractionCalls/pension_provident.json` and `study_fund.json`. Verify: the fixture test passes and `life_insurance_savings.json` is unchanged in `git diff`.

## 2. Wording seen by the classifier, the planner and the client

- [x] 2.1 In `catalog.ts` add a fund-only hint, point the two fund types to it, and rewrite their `descriptionHe` to ask for the certificate only; leave `SAVINGS_CERTIFICATE_HINT_HE` on life insurance. Verify: `npm test -- capitalCatalog` passes and the two descriptions no longer hold "או העמוד האחרון".
- [x] 2.2 In `prompt.md` split the savings special-case block: certificate only for `pension_provident` and `study_fund`, two forms kept for `life_insurance_savings`; tell the planner to name the missing certificate after such a rejection. Verify: read the rendered planner prompt for a client with one pension item and one insurance item (`npm run call` on a fresh local planner call, or the prompt test) and see both sentences.
- [x] 2.3 Check `formIntakeCall.ts` and the fetch `documentDescriptionHe` strings for the two-forms sentence on these types and align any that state it. Verify: `grep` for "הדוח השנתי המקוצר" under `src/agents/declarationOfCapital` returns only bank, life-insurance and fetch-title lines.

## 3. Evals

- [x] 3.1 No new PDF was needed: the existing `menora_pension_2025.pdf` is already a short annual report with a year-end balance and no certificate heading. It serves both rejected cases (ext_06, and ext_29 under the file name "אישור מס להצהרת הון.pdf"). Verify: `git status` shows no change under `evals/files/`.
- [x] 3.2 Add two cases to `evals/cases/extract_document.json` (use the `add-eval-case` skill): both expect `tax_certificate_title: null` and a failed verdict on `type_fields`. Add the expected title to the existing pension and study fund cases. Verify: the cases load in the harness.
- [x] 3.3 Run the extraction evals with a fresh model run for the pension and study fund cases (use the `run-evals` skill, pass `--models`). Verify: the new cases fail verification as expected and every existing fund case with a certificate still passes.

## 4. Docs

- [x] 4.1 Update the savings-family paragraph in `docs/agents.md`: certificate required for pension and study fund, two forms only for life insurance. Verify: the paragraph names the new field and the date of the rule.
- [x] 4.2 Update the Notion extraction child pages of the two types (read `STYLE.md` first). Verify: both pages list the new field and the one accepted form.

## 5. Whole-flow checks

- [x] 5.1 Run `npm run typecheck` and `npm test`. Verify: both finish with no failure.
- [ ] 5.2 For each fund-site fetch provider, verify one real download against the new extraction. NOT DONE: no real downloaded PDF is stored on this machine, and a live download needs the owner's one-time code. What the code asks each site for (read from `src/browserRunner/` and `documentFetch/providers.ts`, not proof of the PDF's content):
  - Altshuler Shaham → "short annual report + tax certificates": expected to carry the certificate.
  - Menora → report type "שנתי מקוצר / אישור מס והצהרת הון": expected to carry it (the real-shape eval file passes).
  - Meitav → periodic annual report: the real-shape eval file (ext_15) carries the certificate and passes.
  - Harel → every row the filters return, tax-certificate rows among them: the report rows without the certificate will be rejected, the certificate row should pass.
  - Migdal → the full report, the short report and a separate "אישור מס" file: the two reports will be rejected unless they print the heading; whether the separate file's heading holds "הצהרת הון" is unknown.
  - Phoenix → "דוח שנתי מפורט" and "דוח שנתי מקוצר": unknown whether either prints the certificate.
- [ ] 5.3 Live check on the dev stack (owner runs it; not done by Claude): send a balance-only pension report by WhatsApp to a test client. Verify: the `verify_extraction` step shows `type_fields` failed with the certificate note, the item stays open, and the agent's reply asks for the "אישור מס להצהרת הון".

## 6. Life-insurance savings follows the same rule (added 2026-11-28)

- [x] 6.1 In `documentTypes/lifeInsuranceSavings.ts` add the required `tax_certificate_title` field (same pattern and notes) to the fields, the zod schema and the prompt, and rewrite the accepted-forms paragraph to one form. Verify: the prompt/schema agreement test passes for the type.
- [x] 6.2 In `catalog.ts` rewrite the type's `descriptionHe`, point it to the certificate hint and delete the old two-forms hint. Verify: `grep` for "שתי צורות קבילות למסמך" under `src/agents/declarationOfCapital` returns nothing.
- [x] 6.3 In `prompt.md` make the savings block one rule for the three types: the certificate is a must, the report is never offered as a replacement. Verify: the block no longer holds "כחלופה שוות ערך".
- [x] 6.4 Update the unit tests (a balance-only insurance report now fails with the certificate note; the three types declare the same fields) and regenerate `tests/fixtures/extractionCalls/life_insurance_savings.json`. Verify: `npm test` passes.
- [x] 6.5 Life-insurance eval cases: no extraction case existed for the type and no classification or planner case depends on the two forms. Added ext_30 (a Clal insurance report whose heading carries the certificate) and ran it on two models. Verify: ext_30 passes on both; the rejected side (an insurance report with no certificate heading) is proven by the unit test, because no synthetic balance-only insurance PDF exists.
- [x] 6.6 Update `docs/agents.md`, the evals README and the Notion pages (Life insurance savings, its checks page, Funds, and the sentence on the two fund pages that says life insurance lacks the field). Verify: no page says an insurance policy accepts the last report page alone.
- [x] 6.7 Run `npm run typecheck` and `npm test`. Verify: both finish with no failure.
