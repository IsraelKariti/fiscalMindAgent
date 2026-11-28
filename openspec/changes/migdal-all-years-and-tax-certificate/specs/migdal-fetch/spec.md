## MODIFIED Requirements

### Requirement: Migdal documents are taken per report type and product with the site's own filters
After login the platform SHALL open the reports page "הדוחות והאישורים שלי" and SHALL run four annual-report filter rounds, in this order: report type "דוח שנתי" with product "פנסיה", "דוח שנתי" with "השתלמות", "דוח שנתי מקוצר" with "פנסיה", "דוח שנתי מקוצר" with "השתלמות". Each round SHALL pick the report type and the product by their visible labels in the page's dropdowns, pick the year by the rule below and press "הצג אישור". A product label the site does not offer for that report type (the product list is per account) SHALL end that round with nothing, not fail the fetch.

The year SHALL be picked as follows. When the tax year is an option of the year dropdown, that option SHALL be selected. When it is not an option and the dropdown offers "כל השנים", "כל השנים" SHALL be selected. When the dropdown offers neither, the round SHALL end with nothing. A missing year SHALL never fail the fetch and SHALL never cause another year's document to be downloaded.

A round answered with "לא מצאנו נתונים לתצוגה" SHALL append nothing. Otherwise the rows the list shows SHALL be downloaded, tagged `pension_annual` for the פנסיה rounds and `study_fund_annual` for the השתלמות rounds, subject to the title check: in a round searched with the tax year selected, a row whose on-site title does not carry the tax year as a four-digit string SHALL be skipped and logged; in a round searched with "כל השנים", only a row whose on-site title carries "לשנת" followed by the tax year SHALL be taken, and every other row SHALL be skipped. Rows with the same title within one kind SHALL be downloaded once. A list with a single result (the site then shows no results count) SHALL be read like any other list. Health-insurance reports (product "בריאות") SHALL never be requested.

When the login worked and no round of any report type delivered a document, the session SHALL end with the "no documents on the site" outcome.

#### Scenario: Full and short pension reports for 2024
- **WHEN** the tax year is 2024 and the "דוח שנתי" / "פנסיה" round lists "דוח שנתי לעמית- מקפת אישית - לשנת 2024" and the "דוח שנתי מקוצר" / "פנסיה" round lists "דוח שנתי מקוצר לעמית -מקפת אישית - לשנת 2024"
- **THEN** both documents are downloaded and tagged `pension_annual`, and both files attach to the client's Migdal pension row

#### Scenario: Study fund not held
- **WHEN** the product dropdown for "דוח שנתי" offers "פנסיה" and "בריאות" but not "השתלמות"
- **THEN** the study-fund rounds append nothing and the pension documents are still delivered

#### Scenario: Year the site does not list
- **WHEN** the tax year is 2016, the year dropdown offers "כל השנים" and 2019 to 2026, and the "דוח שנתי" / "פנסיה" search with "כל השנים" lists "דוח שנתי לעמית- מקפת אישית - לשנת 2016"
- **THEN** the round is searched with "כל השנים", that document is downloaded and tagged `pension_annual`, and the fetch does not fail

#### Scenario: All-years list holds other years
- **WHEN** the tax year is 2016 and a round searched with "כל השנים" lists reports titled "לשנת 2020", "לשנת 2017" and "לשנת 2016"
- **THEN** only the report titled "לשנת 2016" is downloaded and the others are skipped

#### Scenario: All-years list has nothing for the year
- **WHEN** the tax year is 2012 and every round searched with "כל השנים" lists only reports of other years or answers "לא מצאנו נתונים לתצוגה"
- **THEN** nothing is downloaded and the session ends with the "no documents on the site" outcome

#### Scenario: Single result
- **WHEN** a round's search finds exactly one report and the page shows "תהליך הפקת האישור הסתיים בהצלחה" with one row and no results count
- **THEN** that row is read and downloaded like a row of a longer list

#### Scenario: No documents in any round
- **WHEN** the login worked and every round answered "לא מצאנו נתונים לתצוגה", had no matching product or held no row for the tax year
- **THEN** the session ends with the "no documents on the site" outcome and the client receives the canned Migdal no-documents message, and the agent is told not to retry blindly

### Requirement: Migdal downloads carry the on-site report title
Each downloaded file SHALL be the PDF the site itself serves for that row, with the row's on-site title (whitespace collapsed) kept as the document title. The file label stored with the document SHALL be the title followed by "מגדל" and the tax year. The WhatsApp confirmation and the email SHALL name the products fetched (הפנסיה / קרן ההשתלמות) and list the titles when more than one file was fetched. When every fetched file is an annual report the wording SHALL call the files annual reports ("דוח שנתי" / "דוחות שנתיים"); when at least one fetched file is a tax certificate the wording SHALL call them documents ("מסמך" / "מסמכים"). The description of the two offered Migdal document types SHALL name the full annual report, the short annual report and the tax certificate.

#### Scenario: Two pension files delivered
- **WHEN** "דוח שנתי לעמית- מקפת אישית - לשנת 2024" and "דוח שנתי מקוצר לעמית -מקפת אישית - לשנת 2024" are delivered for the pension
- **THEN** the files are labelled "דוח שנתי לעמית- מקפת אישית - לשנת 2024 — מגדל 2024" and "דוח שנתי מקוצר לעמית -מקפת אישית - לשנת 2024 — מגדל 2024", the WhatsApp line says two annual reports of the pension were fetched from מגדל, and the email lists both titles

#### Scenario: Tax certificate among the files
- **WHEN** "דוח שנתי לעמית- מקפת אישית - לשנת 2024" and "אישור מס לשנת 2024 עבור מקפת אישית" are delivered for the pension
- **THEN** the tax certificate is labelled "אישור מס לשנת 2024 עבור מקפת אישית — מגדל 2024", the WhatsApp line says two documents of the pension were fetched from מגדל, and the email lists both titles

## ADDED Requirements

### Requirement: Migdal tax certificates are taken for the pension and the study fund
After the four annual-report rounds the platform SHALL take the report type "אישור מס" in the same login. The tax certificate SHALL run only when the tax year is an option of the year dropdown shown for that report type (this type offers no "כל השנים"); when it is not an option the tax certificate SHALL be skipped, logged, and SHALL NOT fail the fetch or take another year.

The product dropdown of "אישור מס" lists the account's own product names. Each offered product SHALL be sorted by its name: a name containing "השתלמות" is the study fund; otherwise a name containing "מקפת", "פנסיה" or "גמל" is the pension; any other name ("כל המוצרים", "בריאות", an unknown product) SHALL be skipped and logged. For every sorted product the platform SHALL select the product and the tax year and press "הצג אישור". A search answered with "לא מצאנו נתונים לתצוגה" SHALL append nothing. Otherwise every row whose on-site title carries "לשנת" followed by the tax year SHALL be downloaded and tagged `study_fund_annual` for a study-fund product and `pension_annual` for a pension product; other rows SHALL be skipped and logged. A tax certificate SHALL attach to the same checklist row as the annual reports of its kind, under the existing row rules, including when it is the only file fetched for that kind.

#### Scenario: Pension tax certificate for 2024
- **WHEN** the tax year is 2024, the "אישור מס" product dropdown offers "כל המוצרים", "בריאות", "מגדל השתלמות" and "מקפת אישית", and the "מקפת אישית" search lists "אישור מס לשנת 2024 עבור מקפת אישית"
- **THEN** that file is downloaded, tagged `pension_annual`, and attaches to the client's Migdal pension row together with the annual reports

#### Scenario: Study fund product without a certificate
- **WHEN** the "מגדל השתלמות" search for the tax year answers "לא מצאנו נתונים לתצוגה"
- **THEN** nothing is appended for the study fund and the fetch continues

#### Scenario: Health is never searched
- **WHEN** the "אישור מס" product dropdown offers "בריאות"
- **THEN** no search is run for "בריאות" and no health certificate is downloaded

#### Scenario: Tax year not offered for the tax certificate
- **WHEN** the tax year is 2016 and the "אישור מס" year dropdown offers 2019 to 2025 only
- **THEN** no tax certificate is searched or downloaded, and the annual reports found under "כל השנים" are still delivered

#### Scenario: Only a tax certificate was found
- **WHEN** the annual-report rounds deliver nothing and the pension tax certificate for the tax year is downloaded
- **THEN** the session delivers that file to the Migdal pension row and does not end with the "no documents on the site" outcome
