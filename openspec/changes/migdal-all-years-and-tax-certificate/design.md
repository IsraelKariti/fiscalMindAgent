## Context

See proposal.md for the motivation. Everything below was read live on 2026-11-28 in the owner's own Migdal account (reports page `/mymigdal/info/approvals`).

Annual types ("דוח שנתי" value 39, "דוח שנתי מקוצר" value 40):

- Product dropdown: "כל המוצרים", "פנסיה", "בריאות", "השתלמות".
- Year dropdown: "כל השנים", then 2026 down to 2019. "כל השנים" is the default.
- A search with "כל השנים" also lists years the dropdown does not offer (rows for 2016, 2017, 2018 were listed).
- Titles: "דוח שנתי לעמית- מקפת אישית - לשנת 2016", "דוח שנתי מקוצר לעמית -מקפת אישית - לשנת 2016", "דוח שנתי - בריאות - לשנת 2020".

Tax certificate ("אישור מס" value 32):

- Product dropdown: "כל המוצרים", "בריאות", "מגדל השתלמות", "מקפת אישית". These are the account's product names, not the fixed "פנסיה" / "השתלמות" labels.
- Year dropdown: 2025 down to 2019. No "כל השנים", no current year. It renders as soon as the type is picked.
- Titles: "אישור מס לשנת 2025 עבור מקפת אישית", "אישור מס לשנת 2024 עבור ביטוח בריאות".
- "מגדל השתלמות" for 2025 answered "לא מצאנו נתונים לתצוגה" in this account.

Both:

- One result shows "תהליך הפקת האישור הסתיים בהצלחה" and no "נמצאו N תוצאות". The runner already reads rows from the row links alone (bug fix of the same day, outside this change).
- Download: a click on the title link posts to `imagedocumentinfo`, then `imagedocument` (PDF blob), then the page clicks a blob link with a `download` name. The existing download capture fits; nothing changes there.

Current code: `MIGDAL_ROUNDS` holds four rounds, `runRound` selects type, product and year by label and throws when the year is missing, `selectMigdalRows` keeps titles that contain the year.

## Goals / Non-Goals

**Goals:**

- A tax year missing from the year dropdown no longer ends the fetch.
- The tax certificate is fetched in the same login for the pension and the study fund.
- Never download a document of another year.

**Non-Goals:**

- Other report types on the page ("הצהרת הון", "דוח רבעוני" and the rest).
- Health products.
- A new document kind, catalog type or checklist row for the tax certificate.
- Changes to the worker, the queue, the session flow or the runner HTTP contract.

## Decisions

**1. Year choice is a pure function.** `chooseYearOption(options, taxYear)` returns `{ label, mode: 'year' | 'all_years' }` or `null`. The year label wins; "כל השנים" is the fallback; `null` ends the round with nothing. `runRound` selects the returned label. Alternative considered: always search "כל השנים" and filter by title. Rejected: the site's own filter is the stronger guard when the year is offered, and the owner asked for the dropdown first.

**2. The title check depends on the mode.** In `all_years` mode a row is taken only when its collapsed title matches "לשנת <year>" with no digit after the year. In `year` mode the current check stays (the title contains the year), because study-fund annual titles were never seen live and a stricter check could drop a real document there. `selectMigdalRows` gets the mode as a parameter. Tax-certificate rows always use the strict check: their title form was seen live.

**3. The tax certificate is its own step, not four more rounds.** Its product labels are per account, so the fixed round table cannot name them. A pure `classifyTaxCertificateProduct(label)` returns `'pension_annual' | 'study_fund_annual' | null`: "השתלמות" first, then "מקפת" / "פנסיה" / "גמל", else `null`. The step picks the type, reads the product options, and runs one search per sorted product. Alternative considered: search "כל המוצרים" once and sort rows by title. Rejected: a title such as "אישור מס לשנת 2024 עבור ביטוח בריאות" would need a second name list for titles, and one search per product keeps the kind tied to the selection, as the annual rounds do.

**4. No priming search for the tax certificate.** Its year dropdown renders with the type. The step waits for it briefly; when it never renders or lacks the tax year, the step logs and returns.

**5. A missing year is not an error anywhere.** The `NoDocumentsOnSiteError` throw for a missing year (added 2026-11-28) is removed. The session still ends with the no-documents outcome through the existing "no document in any round" check, which now also counts the tax-certificate step.

**6. Kind reuse.** Tax certificates carry `pension_annual` / `study_fund_annual`. They attach to the same row as the reports, the same way Menora's combined "שנתי מקוצר / אישור מס" does. Whether a file is a tax certificate is read from its title ("אישור מס" prefix) for the delivery wording only; no new field crosses the runner contract.

**7. Order.** Annual rounds first, tax certificate last. A failure inside the tax-certificate step after annual reports were captured still fails the whole download step, as any round failure does today. Alternative considered: swallow tax-certificate errors and deliver the reports. Rejected for now: silent partial results hide a site change; the step evidence already shows where it broke.

## Risks / Trade-offs

- [Only one account was seen] Product names for the tax certificate may differ in other accounts ("קופת גמל להשקעה", "קשת", insurance policies). → Unknown names are skipped and logged with the full option list, so the log shows what to add. "גמל" already covers the provident names.
- [Sorting by name] A product whose name holds none of the words is never fetched. → Same log line; the annual reports are unaffected.
- [All-years lists can be long] An account with many years lists many rows. → Only rows of the tax year are downloaded; the rest are skipped without a click.
- [A tax certificate alone marks the row received] A tax certificate shows deposits, not the balance at 31.12. The row is still marked received like any fetched file. → Accepted by the spec; the file check on the fetched file reports what the document holds. Flagged to the owner in the proposal summary.
- [The "כל השנים" behaviour is a site quirk] The site may stop listing old years. → The round then lists nothing for the year and the session ends with the no-documents outcome, the same result as before this change.
- [More searches per login] Up to two more searches. → Same human pauses as the other rounds.

## Migration Plan

Code only. Deploy builds the browser image per commit, so the runner and the worker move together. Rollback is a revert.

## Open Questions

- Study-fund annual titles and study-fund tax-certificate titles were not seen live (the owner's account has none for the checked years). The strict check assumes they also read "לשנת <year>". The log of skipped titles will show it if they do not.
