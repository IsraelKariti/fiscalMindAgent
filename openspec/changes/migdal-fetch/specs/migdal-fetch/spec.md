# migdal-fetch Specification

## Purpose

Governs the Migdal (מגדל) document-fetch provider: how the platform logs in to "מגדל שלי" on the client's behalf, which of the client's documents it takes for a tax year, and what the client and accountant receive.

## ADDED Requirements

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
After login the platform SHALL open the reports page "הדוחות והאישורים שלי" and SHALL run four filter rounds, in this order: report type "דוח שנתי" with product "פנסיה", "דוח שנתי" with "השתלמות", "דוח שנתי מקוצר" with "פנסיה", "דוח שנתי מקוצר" with "השתלמות". Each round SHALL pick the report type, the product and the tax year by their visible labels in the page's dropdowns and press "הצג אישור". A product label the site does not offer for that report type (the product list is per account) SHALL end that round with nothing, not fail the fetch. A tax year the year dropdown does not offer SHALL fail the fetch loudly (never download another year). A round answered with "לא מצאנו נתונים לתצוגה" SHALL append nothing. Otherwise every row the list shows SHALL be downloaded, tagged `pension_annual` for the פנסיה rounds and `study_fund_annual` for the השתלמות rounds; a row whose on-site title does not carry the tax year as a four-digit string SHALL be skipped and logged. Rows with the same title within one kind SHALL be downloaded once. Health-insurance reports (product "בריאות") SHALL never be requested.

#### Scenario: Full and short pension reports for 2024
- **WHEN** the tax year is 2024 and the "דוח שנתי" / "פנסיה" round lists "דוח שנתי לעמית- מקפת אישית - לשנת 2024" and the "דוח שנתי מקוצר" / "פנסיה" round lists "דוח שנתי מקוצר לעמית -מקפת אישית - לשנת 2024"
- **THEN** both documents are downloaded and tagged `pension_annual`, and both files attach to the client's Migdal pension row

#### Scenario: Study fund not held
- **WHEN** the product dropdown for "דוח שנתי" offers "פנסיה" and "בריאות" but not "השתלמות"
- **THEN** the study-fund rounds append nothing and the pension documents are still delivered

#### Scenario: Year the site does not list
- **WHEN** the tax year is 2016 and the year dropdown offers 2019 to 2026 only
- **THEN** the fetch fails with the download-failed outcome and nothing is downloaded

#### Scenario: No documents in any round
- **WHEN** the login worked and all four rounds answered "לא מצאנו נתונים לתצוגה" or had no matching product
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
Each downloaded file SHALL be the PDF the site itself serves for that row, with the row's on-site title (whitespace collapsed) kept as the document title. The file label stored with the document SHALL be the title followed by "מגדל" and the tax year. The WhatsApp confirmation and the email SHALL name the products fetched (הפנסיה / קרן ההשתלמות) and list the titles when more than one file was fetched.

#### Scenario: Two pension files delivered
- **WHEN** "דוח שנתי לעמית- מקפת אישית - לשנת 2024" and "דוח שנתי מקוצר לעמית -מקפת אישית - לשנת 2024" are delivered for the pension
- **THEN** the files are labelled "דוח שנתי לעמית- מקפת אישית - לשנת 2024 — מגדל 2024" and "דוח שנתי מקוצר לעמית -מקפת אישית - לשנת 2024 — מגדל 2024", the WhatsApp line says two annual reports of the pension were fetched from מגדל, and the email lists both titles

### Requirement: Migdal shows as built on the site-access screen
The admin site-access screen SHALL show the Migdal pension and Migdal study-fund cards as built once the provider is registered, with no catalog change.

#### Scenario: Built badge
- **WHEN** an admin opens the site-access screen after the change
- **THEN** the מגדל card under pension and the מגדל card under study funds both carry the built badge
