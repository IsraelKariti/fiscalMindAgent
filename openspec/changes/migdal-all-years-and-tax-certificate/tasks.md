## 1. Year rule for the annual rounds

- [x] 1.1 Add the pure `chooseYearOption(options, taxYear)` in `src/browserRunner/migdal.ts` (year label, else "כל השנים", else null); verify with new cases in `tests/migdalSelect.test.ts` (year offered, year missing with "כל השנים", neither)
- [x] 1.2 Give `selectMigdalRows` a mode: `year` keeps the current "title contains the year" check, `all_years` takes only titles matching "לשנת <year>" with no digit after it; verify with test cases using the live titles of 2016, 2017 and 2020 and a title such as "לשנת 20161"
- [x] 1.3 Use both in `runRound`: select the chosen label, end the round with nothing when the choice is null, pass the mode to the row selection, and remove the missing-year `NoDocumentsOnSiteError`; verify `npm run typecheck` passes and the log line of a round names the mode
- [x] 1.4 Update the flow comment at the top of the provider (year rule, single-result page text); verify the comment matches design.md "Context"

## 2. Tax certificate

- [x] 2.1 Add the pure `classifyTaxCertificateProduct(label)` ("השתלמות" → study fund; "מקפת" / "פנסיה" / "גמל" → pension; else null); verify with test cases for "מקפת אישית", "מגדל השתלמות", "בריאות", "כל המוצרים" and an unknown name
- [x] 2.2 Add the tax-certificate step after the four rounds: pick "אישור מס", read the product options, skip the step when the year dropdown lacks the tax year, run one search per sorted product, take rows by the strict title check, tag by the product's kind, share the `seen` set; verify `npm run typecheck` passes and skipped products and a skipped step are logged with the option lists
- [x] 2.3 Count the step in the "no document in any round" check so a session with only a tax certificate delivers and a session with nothing ends with the no-documents outcome; verify by reading the two branches against the spec scenarios "Only a tax certificate was found" and "No documents in any round"
- [x] 2.4 Save a step screenshot per tax-certificate search, named like the round screenshots; verify the names appear in the evidence list of a smoke run (task 4.2)

## 3. Wording

- [x] 3.1 In `src/agents/declarationOfCapital/documentFetch/providers.ts` change the two Migdal document descriptions to name the full report, the short report and the tax certificate; verify the Migdal prompt block shows the new text in an existing prompt test or a new assertion in `tests/migdalSelect.test.ts`
- [x] 3.2 Make the Migdal WhatsApp confirmation, email subject and email body say "מסמך" / "מסמכים" when a fetched title starts with "אישור מס", and keep the annual-report wording otherwise; verify with test cases for reports only and for a report plus a tax certificate

## 4. Checks

- [x] 4.1 Run `npm run typecheck` and `npm test`; verify both pass
- [ ] 4.2 Owner runs the live smoke (`scripts/migdalFetchSmoke.ts`) for a year the dropdown offers; verify the annual reports and the pension tax certificate of that year are saved
- [ ] 4.3 Owner runs the live smoke for 2016; verify the two 2016 annual reports are saved, no file of another year is saved, and the log says the tax certificate was skipped for the year
