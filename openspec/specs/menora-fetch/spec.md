# menora-fetch Specification

## Purpose

Governs the Menora Mivtachim (מנורה מבטחים) document-fetch provider: how the platform logs in to the Menora personal area on the client's behalf, which of the client's pension and study-fund documents it takes for a tax year, and what the client and accountant receive.

## Requirements

### Requirement: Menora fetch offers pension and study-fund annual documents in one login
The platform SHALL register a fetch provider with id `menora_mivtachim` and site name "מנורה מבטחים" that offers two document types: `pension_annual` and `study_fund_annual`. A required-document row SHALL count as the Menora pension document when its name mentions Menora (מנורה / Menora, any case) and a pension or provident fund (פנסיה or גמל) and not a study fund; it SHALL count as the Menora study-fund document when its name mentions Menora and קרן השתלמות / השתלמות. The fetch SHALL be offerable when at least one of the two kinds has a pending row. The client's consent is to the fetch itself, not per document type: one login SHALL always search both sectors for the tax year, whatever the checklist holds, and the agent's prompt block for Menora SHALL say so (the document-keys field is ignored for Menora).

#### Scenario: Pending Menora pension makes the fetch offerable
- **WHEN** a client with a resolvable national id and a WhatsApp number has a pending required document named "אישור יתרות קופות גמל ופנסיה ליום 31.12.2025 — מנורה מבטחים"
- **THEN** the Menora provider is available, the agent's prompt carries a Menora block listing the pension type as pending, and the agent may offer the fetch instead of asking for an upload

#### Scenario: Only the study fund is on the list
- **WHEN** the client has a pending Menora study-fund row and no Menora pension row, and agrees to the fetch
- **THEN** the session's document set is still both kinds, and the site's pension annual report for the year is downloaded as well

#### Scenario: Non-Menora documents are untouched
- **WHEN** the only pending study-fund row names Meitav
- **THEN** the Menora provider is not available and no Menora block is added to the prompt

### Requirement: Menora login uses the client's national id and WhatsApp number with an SMS code
The Menora login SHALL be performed with the client's national id and the client's WhatsApp number, typed as one number (local form, no prefix split) into the site's single phone-or-email field; a WhatsApp number in international form (972…) SHALL be converted to its local form (0…) first. The code SHALL be requested by message (never by phone call), the provider's code channel SHALL be reported as SMS, and the canned "code sent" message SHALL tell the client the SMS came from מנורה מבטחים. The code SHALL be entered as six digits into the site's six code boxes and submitted with the "אישור" button. When the site rejects the code and still shows the code boxes, the platform SHALL treat it as a rejected code, clear the boxes and let the client send a new one; when the personal area does not load within the wait, the login SHALL fail with the canned login-failed message.

#### Scenario: Code is sent by SMS
- **WHEN** the worker starts a Menora login for a client whose WhatsApp number is 972501234567
- **THEN** the site receives the id and 0501234567, shows the six code boxes, and the client receives the canned message saying the code was just sent by SMS from מנורה מבטחים

#### Scenario: Wrong code can be retried
- **WHEN** the client forwards a wrong code and the site keeps the code boxes up
- **THEN** the client receives the canned rejected-code message and may send another code within the session's wait

### Requirement: Menora short annual reports are taken per sector for the tax year with the reports page's own filters
After login the platform SHALL open the personal area's reports page ("הדוחות שלי") and SHALL run one filter: report type "שנתי מקוצר / אישור מס והצהרת הון", sectors "פנסיה" and "גמל והשתלמות" (never life or health insurance), and the tax year, then press "בצע סינון". A tax year the year list does not offer SHALL fail the fetch loudly (never another year). A filter answered with the site's no-results text SHALL end with the "no documents on the site" outcome. Otherwise every row the list shows SHALL be downloaded, tagged `pension_annual` for rows of the pension sector and `study_fund_annual` for rows of the gemel/study-fund sector; a row whose year is not the tax year SHALL be skipped and logged. Rows with the same title within one kind SHALL be downloaded once. The detailed annual report SHALL NOT be fetched.

#### Scenario: Short pension report for 2018
- **WHEN** the tax year is 2018 and the filter lists "דוח שנתי מקוצר 2018 — מנורה מבטחים פנסיה מקיפה — פנסיה"
- **THEN** the document is downloaded, tagged `pension_annual`, and attaches to the client's Menora pension row

#### Scenario: Study fund not held
- **WHEN** the filter lists only pension rows
- **THEN** nothing is recorded for the study fund and the pension document is still delivered

#### Scenario: No documents for the year
- **WHEN** the login worked and the filter answers "לצערנו, לא נמצאו תוצאות"
- **THEN** the session ends with the "no documents on the site" outcome and the client receives the canned Menora no-documents message, and the agent is told not to retry blindly

#### Scenario: Year the site does not list
- **WHEN** the tax year is 2004 and the year list offers 2005 to 2025 only
- **THEN** the fetch fails with the download-failed outcome and nothing is downloaded

### Requirement: A fetched kind with no Menora row creates its own checklist row
When the delivery of a Menora session holds files of a kind for which the client has no Menora row of that kind (pension: catalog type "pension or provident fund"; study fund: catalog type "study fund") in any status other than retired or not needed, the existing fetched-row creation SHALL apply with the site name "מנורה מבטחים": the client's catalog row of that type is settled as needed when it is still open or marked as not needed, otherwise a new item is added under it, named the catalog name for the tax year with "— מנורה מבטחים" appended; all fetched files of that kind attach to it; the row is marked received and verified like any fetched document; the confirmation adds one "also found … added to the list" sentence per created kind. When the client already has a Menora row of that kind, the files SHALL attach to it and no row is created.

#### Scenario: Study fund found that was not on the list
- **WHEN** the client has a pending Menora pension row, no study-fund item at all, and the fetch downloads a study-fund short annual report for the year
- **THEN** the study-fund catalog row is settled as needed with the name "אישור יתרת קרן השתלמות ליום 31.12.2025 — מנורה מבטחים", the file attaches to it and it is marked received; the confirmation says the study fund was also found at מנורה מבטחים and added to the list

#### Scenario: Menora row already exists
- **WHEN** the list holds a pending Menora pension row and the fetch finds a pension document
- **THEN** the file attaches to that row and no row is created

### Requirement: Menora downloads carry the on-site row title
Each downloaded file SHALL be the PDF the site itself serves for that row, titled "<report type> <year> — <product name>" as the row shows them (e.g. "דוח שנתי מקוצר 2018 — מנורה מבטחים פנסיה מקיפה"). The file label stored with the document SHALL be the title followed by "מנורה מבטחים" and the tax year. The WhatsApp confirmation and the email SHALL name the products fetched (הפנסיה / קרן ההשתלמות) and list the titles when more than one file was fetched.

#### Scenario: Two files delivered
- **WHEN** a pension and a study-fund short annual report for 2025 are delivered
- **THEN** each file is labelled "<its title> — מנורה מבטחים 2025", the WhatsApp line says the annual reports of the pension and the study fund were fetched from מנורה מבטחים, and the email lists both titles

### Requirement: Menora shows as built on the site-access screen
The admin site-access screen SHALL show the Menora pension and Menora study-fund cards as built once the provider is registered, with no catalog change.

#### Scenario: Built badge
- **WHEN** an admin opens the site-access screen after the change
- **THEN** the מנורה מבטחים card under pension and the מנורה מבטחים card under study funds both carry the built badge
