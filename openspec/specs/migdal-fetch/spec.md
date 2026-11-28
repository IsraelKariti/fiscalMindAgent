# migdal-fetch Specification

## Purpose

Governs the Migdal (מגדל) document-fetch provider: how the platform logs in to "מגדל שלי" on the client's behalf, which of the client's documents it takes for a tax year, and what the client and accountant receive.

## Requirements

### Requirement: Migdal fetch offers pension and study-fund annual documents in one login
The platform SHALL register a fetch provider with id `migdal` and site name "מגדל" that offers two document types: `pension_annual` and `study_fund_annual`. A required-document row SHALL count as the Migdal pension document when its name mentions Migdal (מגדל / מקפת / Migdal, any case) and a pension or provident fund (פנסיה, גמל or מקפת) and not a study fund; it SHALL count as the Migdal study-fund document when its name mentions Migdal and קרן השתלמות / השתלמות. The fetch SHALL be offerable when at least one of the two kinds has a pending row. The client's consent is to the fetch itself, not per document type: one login SHALL always search both products for the tax year, whatever the checklist holds, and the agent's prompt block for Migdal SHALL say so (the document-keys field is ignored for Migdal).

#### Scenario: Pending Migdal pension makes the fetch offerable
- **WHEN** a client with a resolvable national id and a WhatsApp number has a pending required document named "אישור יתרה בקופת גמל / קרן פנסיה ליום 31.12.2025 — מגדל מקפת"
- **THEN** the Migdal provider is available, the agent's prompt carries a Migdal block listing the pension type as pending, and the agent may offer the fetch instead of asking for an upload

#### Scenario: Only the study fund is on the list
- **WHEN** the client has a pending Migdal study-fund row and no Migdal pension row, and agrees to the fetch
- **THEN** the session's document set is still both kinds, and the site's pension annual documents for the year are downloaded as well

#### Scenario: Non-Migdal documents are untouched
- **WHEN** the only pending study-fund row names Harel
- **THEN** the Migdal provider is not available and no Migdal block is added to the prompt

### Requirement: Migdal login uses the client's national id with an SMS code to the number registered at Migdal
The Migdal login SHALL be performed with the client's national id only, typed into the login form's id field with the code channel left on "נייד" (SMS). No phone number SHALL be sent to the site: Migdal sends the code to the mobile number it holds for that id. The provider's code channel SHALL be reported as SMS, and the canned "code sent" message SHALL tell the client the SMS went to the mobile number registered at Migdal. The code SHALL be entered as six single digits into the site's six code boxes and submitted with the same "המשך" button. When the site rejects the code and still shows the code boxes, the platform SHALL treat it as a rejected code, clear the boxes and let the client send a new one; when the personal area ("מגדל שלי" lobby) does not load within the wait, the login SHALL fail with the canned login-failed message.

#### Scenario: Code is sent by SMS to the registered number
- **WHEN** the worker starts a Migdal login for a client who agreed
- **THEN** the site shows the six code boxes and the client receives the canned message saying the code was just sent by SMS from מגדל to the mobile number registered there

#### Scenario: Wrong code can be retried
- **WHEN** the client forwards a wrong code and the site keeps the code boxes up
- **THEN** the client receives the canned rejected-code message and may send another code within the session's wait

### Requirement: Migdal documents are taken per report type and product with the site's own filters
After login the platform SHALL open the reports page "הדוחות והאישורים שלי" and SHALL run four annual-report filter rounds, in this order: report type "דוח שנתי" with product "פנסיה", "דוח שנתי" with "השתלמות", "דוח שנתי מקוצר" with "פנסיה", "דוח שנתי מקוצר" with "השתלמות". Each round SHALL pick the report type and the product by their visible labels in the page's dropdowns, pick the year by the rule below and press "הצג אישור". A product label the site does not offer for that report type (the product list is per account) SHALL end that round with nothing, not fail the fetch.

The year SHALL be picked as follows. When the tax year is an option of the year dropdown, that option SHALL be selected. When it is not an option and the dropdown offers "כל השנים", "כל השנים" SHALL be selected. When the dropdown offers neither, the round SHALL end with nothing. A missing year SHALL never fail the fetch and SHALL never cause another year's document to be downloaded.

A round answered with "לא מצאנו נתונים לתצוגה" SHALL append nothing. Otherwise the rows the list shows SHALL be downloaded, tagged `pension_annual` for the פנסיה rounds and `study_fund_annual` for the השתלמות rounds, subject to the title check, which is the same for every search: only a row whose on-site title carries the tax year as a four-digit number SHALL be taken, wherever in the title the year stands; a title where those four digits are part of a longer number does not carry the year; every other row SHALL be skipped and logged. In a round searched with "כל השנים" the title is the only thing that tells the year. Rows with the same title within one kind SHALL be downloaded once. A list with a single result (the site then shows no results count) SHALL be read like any other list. Health-insurance reports (product "בריאות") SHALL never be requested.

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

#### Scenario: The year stands elsewhere in the title
- **WHEN** the tax year is 2016 and a round searched with "כל השנים" lists a report titled "דוח שנתי 2016 לעמית - מקפת אישית"
- **THEN** that report is downloaded, although the title does not read "לשנת 2016"

#### Scenario: The digits are part of a longer number
- **WHEN** the tax year is 2016 and a listed title holds "120165" and no other number
- **THEN** that row is skipped

#### Scenario: All-years list has nothing for the year
- **WHEN** the tax year is 2012 and every round searched with "כל השנים" lists only reports of other years or answers "לא מצאנו נתונים לתצוגה"
- **THEN** nothing is downloaded and the session ends with the "no documents on the site" outcome

#### Scenario: Single result
- **WHEN** a round's search finds exactly one report and the page shows "תהליך הפקת האישור הסתיים בהצלחה" with one row and no results count
- **THEN** that row is read and downloaded like a row of a longer list

#### Scenario: No documents in any round
- **WHEN** the login worked and every round answered "לא מצאנו נתונים לתצוגה", had no matching product or held no row for the tax year
- **THEN** the session ends with the "no documents on the site" outcome and the client receives the canned Migdal no-documents message, and the agent is told not to retry blindly

### Requirement: A fetched kind with no Migdal row creates its own checklist row
When the delivery of a Migdal session holds files of a kind for which the client has no Migdal row of that kind (pension: catalog type "pension or provident fund"; study fund: catalog type "study fund") in any status other than retired or not needed, the existing fetched-row creation SHALL apply with the site name "מגדל": the client's catalog row of that type is settled as needed when it is still open or marked as not needed, otherwise a new item is added under it, named the catalog name for the tax year with "— מגדל" appended; all fetched files of that kind (full and short reports) attach to it; the row is marked received and verified like any fetched document; the confirmation adds one "also found … added to the list" sentence per created kind. When the client already has a Migdal row of that kind, the files SHALL attach to it and no row is created.

#### Scenario: Pension found that was not on the list
- **WHEN** the client has a pending Migdal study-fund row, no pension item at all, and the fetch downloads a full and a short pension report for the year
- **THEN** the pension catalog row is settled as needed with the name "אישור יתרה בקופת גמל / קרן פנסיה ליום 31.12.2024 — מגדל", both files attach to it and it is marked received; the confirmation says the pension was also found at מגדל and added to the list

#### Scenario: Migdal row already exists
- **WHEN** the list holds a pending Migdal pension row and the fetch finds pension documents
- **THEN** the files attach to that row and no row is created

### Requirement: Migdal downloads carry the on-site report title
Each downloaded file SHALL be the PDF the site itself serves for that row, with the row's on-site title (whitespace collapsed) kept as the document title. The file label stored with the document SHALL be the title followed by "מגדל" and the tax year. The WhatsApp confirmation and the email SHALL name the products fetched (הפנסיה / קרן ההשתלמות) and list the titles when more than one file was fetched. When every fetched file is an annual report the wording SHALL call the files annual reports ("דוח שנתי" / "דוחות שנתיים"); when at least one fetched file is a tax certificate the wording SHALL call them documents ("מסמך" / "מסמכים"). The description of the two offered Migdal document types SHALL name the full annual report, the short annual report and the tax certificate.

#### Scenario: Two pension files delivered
- **WHEN** "דוח שנתי לעמית- מקפת אישית - לשנת 2024" and "דוח שנתי מקוצר לעמית -מקפת אישית - לשנת 2024" are delivered for the pension
- **THEN** the files are labelled "דוח שנתי לעמית- מקפת אישית - לשנת 2024 — מגדל 2024" and "דוח שנתי מקוצר לעמית -מקפת אישית - לשנת 2024 — מגדל 2024", the WhatsApp line says two annual reports of the pension were fetched from מגדל, and the email lists both titles

#### Scenario: Tax certificate among the files
- **WHEN** "דוח שנתי לעמית- מקפת אישית - לשנת 2024" and "אישור מס לשנת 2024 עבור מקפת אישית" are delivered for the pension
- **THEN** the tax certificate is labelled "אישור מס לשנת 2024 עבור מקפת אישית — מגדל 2024", the WhatsApp line says two documents of the pension were fetched from מגדל, and the email lists both titles

### Requirement: Migdal shows as built on the site-access screen
The admin site-access screen SHALL show the Migdal pension and Migdal study-fund cards as built once the provider is registered, with no catalog change.

#### Scenario: Built badge
- **WHEN** an admin opens the site-access screen after the change
- **THEN** the מגדל card under pension and the מגדל card under study funds both carry the built badge

### Requirement: Migdal tax certificates are taken for the pension and the study fund
After the four annual-report rounds the platform SHALL take the report type "אישור מס" in the same login. The tax certificate SHALL run only when the tax year is an option of the year dropdown shown for that report type (this type offers no "כל השנים"); when it is not an option the tax certificate SHALL be skipped, logged, and SHALL NOT fail the fetch or take another year.

The product dropdown of "אישור מס" lists the account's own product names. Each offered product SHALL be sorted by its name: a name containing "השתלמות" is the study fund; otherwise a name containing "מקפת", "פנסיה" or "גמל" is the pension; any other name ("כל המוצרים", "בריאות", an unknown product) SHALL be skipped and logged. For every sorted product the platform SHALL select the product and the tax year and press "הצג אישור". A search answered with "לא מצאנו נתונים לתצוגה" SHALL append nothing. Otherwise every row whose on-site title carries the tax year as a four-digit number (the same title check as the annual rounds) SHALL be downloaded and tagged `study_fund_annual` for a study-fund product and `pension_annual` for a pension product; other rows SHALL be skipped and logged. A tax certificate SHALL attach to the same checklist row as the annual reports of its kind, under the existing row rules, including when it is the only file fetched for that kind.

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
