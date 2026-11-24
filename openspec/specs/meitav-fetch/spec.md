# meitav-fetch Specification

## Purpose

Governs the Meitav (מיטב) document-fetch provider: how the platform logs in to the Meitav customer portal on the client's behalf, which of the client's pension and study-fund documents it takes for a tax year, how a wrong one-time code is handled, and what the client and accountant receive.

## Requirements

### Requirement: Meitav fetch offers pension and study-fund annual documents in one login
The platform SHALL register a fetch provider with id `meitav` and site name "מיטב" that offers two document types: `pension_annual` and `study_fund_annual`. A required-document row SHALL count as the Meitav pension document when its name mentions Meitav (מיטב / מיטב דש / Meitav, any case) and a pension or provident fund (פנסיה or גמל) and not a study fund; it SHALL count as the Meitav study-fund document when its name mentions Meitav and קרן השתלמות / השתלמות. A row that mentions Meitav Trade (מיטב טרייד) or a securities portfolio SHALL match neither type. The fetch SHALL be offerable when at least one of the two kinds has a pending row. The client's consent is to the fetch itself, not per document type: one login SHALL always search both products for the tax year, whatever the checklist holds, and the agent's prompt block for Meitav SHALL say so (the document-keys field is ignored for Meitav).

#### Scenario: Pending Meitav pension makes the fetch offerable
- **WHEN** a client with a resolvable national id and a WhatsApp number has a pending required document named "אישור יתרות קופות גמל ופנסיה ליום 31.12.2025 — מיטב"
- **THEN** the Meitav provider is available, the agent's prompt carries a Meitav block listing the pension type as pending, and the agent may offer the fetch instead of asking for an upload

#### Scenario: Only the study fund is on the list
- **WHEN** the client has a pending Meitav study-fund row and no Meitav pension row, and agrees to the fetch
- **THEN** the session's document set is still both kinds, and the site's pension annual documents for the year are downloaded as well

#### Scenario: Securities portfolio at Meitav Trade is not this provider
- **WHEN** the only pending row naming Meitav is "אישור יתרה של תיק ניירות הערך ליום 31.12.2025 — מיטב טרייד"
- **THEN** the Meitav provider is not available and no Meitav block is added to the prompt

#### Scenario: Non-Meitav documents are untouched
- **WHEN** the only pending study-fund row names Migdal
- **THEN** the Meitav provider is not available and no Meitav block is added to the prompt

### Requirement: Meitav login uses the client's national id and WhatsApp number with an SMS code
The Meitav login SHALL be performed with the client's national id and the client's WhatsApp number, entered as the site asks: the number's three-digit mobile prefix chosen from the site's prefix list and the remaining seven digits typed into the number field. A WhatsApp number in international form (972…) SHALL be converted to its local form (0…) first. A number whose prefix is not in the site's list, or that does not leave exactly seven digits after the prefix, SHALL fail the login before the site is touched, with the canned login-failed message. The provider's code channel SHALL be reported as SMS, and the canned "code sent" message SHALL tell the client the SMS came from מיטב. The code SHALL be typed into the site's single code field and submitted. When the site shows its wrong-code text ("הקוד שהזנת שגוי") and keeps the code screen up, the platform SHALL treat it as a rejected code, clear the field and let the client send a new one. When the personal area does not load within the wait and no wrong-code text is shown, the login SHALL fail with the canned login-failed message. The platform SHALL NOT press the site's "send again" link on its own.

#### Scenario: Code is sent by SMS
- **WHEN** the worker starts a Meitav login for a client whose WhatsApp number is 972501234567
- **THEN** the site receives prefix 050 and digits 1234567, shows the code screen, and the client receives the canned message saying the code was just sent by SMS from מיטב

#### Scenario: Wrong code can be retried
- **WHEN** the client forwards a wrong code and the site shows "הקוד שהזנת שגוי, יש להזין את הקוד בשנית"
- **THEN** the client receives the canned rejected-code message and may send another code within the session's wait

#### Scenario: Phone the site cannot take
- **WHEN** the client's WhatsApp number is a landline (prefix 03) or has the wrong length
- **THEN** no login is attempted and the session ends with the login-failed outcome

### Requirement: Meitav annual reports are taken per product for the tax year from the periodic-reports page
After login the platform SHALL open the personal area's periodic-reports page ("דוחות תקופתיים") and SHALL narrow it to the tax year with the page's own year picker. The page lists the account's reports in one card per product; the platform SHALL walk every card and take, from each, the annual reports of the tax year: the detailed annual report ("דוח שנתי מפורט דצמבר <year>") and the short annual report ("דוח שנתי מקוצר דצמבר <year>"). Quarterly reports ("דוח רבעוני …") SHALL be skipped. A report SHALL be tagged `pension_annual` when its card is a pension or provident fund (פנסיה / גמל) and `study_fund_annual` when its card is a study fund (השתלמות); a card of any other product SHALL be skipped and logged. A product the account does not hold simply has no card and SHALL not fail the fetch. The year picker offers only the years the account has reports for: a tax year it does not offer means the account has no reports for that year, and the fetch SHALL end with the "no documents on the site" outcome without downloading anything (never another year). A listed report whose on-site title does not carry the tax year as a four-digit string SHALL be skipped and logged. Reports with the same title within one kind SHALL be downloaded once. Documents of the Meitav Trade (securities) area SHALL never be taken by this provider.

#### Scenario: Detailed and short pension reports for 2023
- **WHEN** the tax year is 2023 and the pension card lists "דוח שנתי מפורט דצמבר 2023" and "דוח שנתי מקוצר דצמבר 2023"
- **THEN** both reports are downloaded, tagged `pension_annual`, and attach to the client's Meitav pension row

#### Scenario: Quarterly reports are left alone
- **WHEN** the year picker is on 2026 by default and the pension card lists "דוח רבעוני ספטמבר 2026"
- **THEN** the platform switches the picker to the tax year and the quarterly report is never downloaded

#### Scenario: Study fund not held
- **WHEN** the account shows a pension card and no study-fund card
- **THEN** the pension reports are delivered and nothing is recorded for the study fund

#### Scenario: Year the account has no reports for
- **WHEN** the tax year is 2016 and the year picker offers 2018 to 2023 and 2026 only
- **THEN** nothing is downloaded, the session ends with the "no documents on the site" outcome, the client receives the canned Meitav no-documents message, and the agent is told not to retry blindly

#### Scenario: Year offered but only quarterly reports listed
- **WHEN** the tax year is offered and every card lists only quarterly reports for it
- **THEN** nothing is downloaded and the session ends with the "no documents on the site" outcome

### Requirement: A fetched kind with no Meitav row creates its own checklist row
When the delivery of a Meitav session holds files of a kind for which the client has no Meitav row of that kind (pension: catalog type "pension or provident fund"; study fund: catalog type "study fund") in any status other than retired or not needed, the existing fetched-row creation SHALL apply with the site name "מיטב": the client's catalog row of that type is settled as needed when it is still open or marked as not needed, otherwise a new item is added under it, named the catalog name for the tax year with "— מיטב" appended; all fetched files of that kind attach to it; the row is marked received and verified like any fetched document; the confirmation adds one "also found … added to the list" sentence per created kind. When the client already has a Meitav row of that kind, the files SHALL attach to it and no row is created.

#### Scenario: Study fund found that was not on the list
- **WHEN** the client has a pending Meitav pension row, no study-fund item at all, and the fetch downloads a study-fund annual report for the year
- **THEN** the study-fund catalog row is settled as needed with the name "אישור יתרת קרן השתלמות ליום 31.12.2025 — מיטב", the file attaches to it and it is marked received; the confirmation says the study fund was also found at מיטב and added to the list

#### Scenario: Meitav row already exists
- **WHEN** the list holds a pending Meitav pension row and the fetch finds pension documents
- **THEN** the files attach to that row and no row is created

### Requirement: Meitav downloads carry the on-site document title
Each downloaded file SHALL be the PDF the site itself serves for that document, with the document's on-site title (whitespace collapsed) kept as the document title. The file label stored with the document SHALL be the title followed by "מיטב" and the tax year. The WhatsApp confirmation and the email SHALL name the products fetched (הפנסיה / קרן ההשתלמות) and list the titles when more than one file was fetched.

#### Scenario: Two files delivered
- **WHEN** a pension annual report and a study-fund annual report for 2025 are delivered
- **THEN** each file is labelled "<its title> — מיטב 2025", the WhatsApp line says the annual reports of the pension and the study fund were fetched from מיטב, and the email lists both titles

### Requirement: Meitav shows as built on the site-access screen
The admin site-access screen SHALL show the Meitav pension and Meitav study-fund cards as built once the provider is registered, with no catalog change.

#### Scenario: Built badge
- **WHEN** an admin opens the site-access screen after the change
- **THEN** the מיטב card under pension and the מיטב card under study funds both carry the built badge
