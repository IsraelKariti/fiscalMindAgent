## Purpose

Governs the Phoenix (הפניקס) document-fetch provider: how the platform logs in to the Phoenix personal area on the client's behalf, which of the client's documents it takes for a tax year, and what the client and accountant receive.

## ADDED Requirements

### Requirement: Phoenix fetch offers pension and study-fund annual documents in one login
The platform SHALL register a fetch provider with id `phoenix` and site name "הפניקס" that offers two document types: `pension_annual` and `study_fund_annual`. A required-document row SHALL count as the Phoenix pension document when its name mentions Phoenix (הפניקס / פניקס / Phoenix, any case) and a pension or provident fund (פנסיה or גמל) and not a study fund; it SHALL count as the Phoenix study-fund document when its name mentions Phoenix and קרן השתלמות / השתלמות. Both types SHALL be fetchable in one login, with the client's consent taken per document type, exactly as for Altshuler Shaham.

#### Scenario: Pending Phoenix study fund makes the fetch offerable
- **WHEN** a client with a resolvable national id and a WhatsApp number has a pending required document named "אישור יתרת קרן השתלמות ליום 31.12.2025 — הפניקס"
- **THEN** the Phoenix provider is available, the agent's prompt carries a Phoenix block listing the study-fund type as pending, and the agent may offer the fetch instead of asking for an upload

#### Scenario: Both Phoenix documents pending
- **WHEN** the client has pending Phoenix pension and study-fund rows and agrees to both
- **THEN** one login session fetches both types and both checklist rows are satisfied by the delivered files

#### Scenario: Non-Phoenix documents are untouched
- **WHEN** the only pending study-fund row names Harel
- **THEN** the Phoenix provider is not available and no Phoenix block is added to the prompt

### Requirement: Phoenix login uses the client's national id and WhatsApp number with an SMS code
The Phoenix login SHALL be performed with the client's national id (identity type ת.ז) and the client's WhatsApp number in local 05X form, and SHALL request the one-time code by SMS to that number. The provider's code channel SHALL be reported as SMS, so the agent tells the client to look for an SMS. When the site rejects the code and still shows the code screen, the platform SHALL treat it as a rejected code and let the client send a new one; when the personal area does not load within the wait, the login SHALL fail with the canned login-failed message.

#### Scenario: Code is sent by SMS
- **WHEN** the worker starts a Phoenix login for a client who agreed
- **THEN** the site sends the code by SMS to the client's WhatsApp number and the client receives the canned "the code was just sent by SMS from הפניקס" message

#### Scenario: Wrong code can be retried
- **WHEN** the client forwards a wrong code and the site keeps the code screen up
- **THEN** the client receives the canned rejected-code message and may send another code within the session's wait

### Requirement: Phoenix documents are selected by sector and report name across every page
After login the platform SHALL open the personal area's reports list ("דוחות ומסמכים" → "דוחות") and SHALL walk every page using the list's page-bar controls only, never the site's sector, type or year filters. From every row it SHALL read the report name and the תחום (sector) column. A row SHALL be taken for `pension_annual` when its sector contains "פנסיה", and for `study_fund_annual` when its sector contains "השתלמות", in both cases only when the report name contains the tax year as a four-digit string and does not contain "רבעון". The row's date column SHALL NOT be used for the year decision. Every taken row SHALL be downloaded, including rows with identical names (a client may hold several policies with the same report name). Only the document types the client agreed to SHALL be taken.

#### Scenario: Study fund for 2024
- **WHEN** the tax year is 2024, the client agreed to the study fund only, and the list holds "דוח שנתי מלא 2024" and "דוח שנתי מקוצר ואישור מס 2024" under גמל והשתלמות plus "דוח מפורט לשנת 2024" under חיים/פנסיה
- **THEN** exactly the two גמל והשתלמות documents are downloaded, both tagged `study_fund_annual`

#### Scenario: Quarterly reports are skipped
- **WHEN** the tax year is 2023 and the חיים/פנסיה sector lists "דוח מפורט לשנת 2023", "דוח מקוצר לשנת 2023", "אישור מס ביטוח חיים מקוצר לשנת 2023" and "דוח רבעון ראשון לשנת 2023"
- **THEN** the three annual documents are downloaded as `pension_annual` and the quarterly report is not

#### Scenario: Year comes from the name, not the date
- **WHEN** a row is dated 15.03.2025 and named "דוח שנתי מלא 2024" and the tax year is 2024
- **THEN** the row is taken; a row dated 31.12.2024 whose name says 2023 is not

#### Scenario: Matching rows on later pages
- **WHEN** the matching rows sit on page 3 of 9
- **THEN** the walk reaches them by pressing the page bar's next control until the current page is the last page shown, and they are downloaded

#### Scenario: No matching row anywhere
- **WHEN** the login worked, every page was walked, and no row matched the agreed types for the tax year
- **THEN** the session ends with the "no documents on the site" outcome and the client receives the canned Phoenix no-documents message, and the agent is told not to retry blindly

### Requirement: Phoenix downloads carry the on-site report name
Each downloaded file SHALL be the PDF the site itself serves for that row, with its on-site report name kept as the document title. The file label stored with the document SHALL be the report name followed by "הפניקס" and the tax year. The WhatsApp confirmation and the email SHALL name the products fetched (הפנסיה / קרן ההשתלמות) and list the report names when more than one file was fetched.

#### Scenario: Two study-fund files delivered
- **WHEN** "דוח שנתי מלא 2024" and "דוח שנתי מקוצר ואישור מס 2024" are delivered for the study fund
- **THEN** the files are labelled "דוח שנתי מלא 2024 — הפניקס 2024" and "דוח שנתי מקוצר ואישור מס 2024 — הפניקס 2024", the WhatsApp line says the study-fund documents were fetched from הפניקס, and the email lists both names

### Requirement: Phoenix shows as built on the site-access screen
The admin site-access screen SHALL show the Phoenix pension and Phoenix study-fund cards as built once the provider is registered, with no catalog change.

#### Scenario: Built badge
- **WHEN** an admin opens the site-access screen after the change
- **THEN** the הפניקס card under pension and the הפניקס card under study funds both carry the built badge
