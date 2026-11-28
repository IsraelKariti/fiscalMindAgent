# phoenix-fetch Specification

## Purpose

Governs the Phoenix (הפניקס) document-fetch provider: how the platform logs in to the Phoenix personal area on the client's behalf, which of the client's documents it takes for a tax year, and what the client and accountant receive.

## Requirements

### Requirement: Phoenix fetch offers pension and study-fund annual documents in one login
The platform SHALL register a fetch provider with id `phoenix` and site name "הפניקס" that offers two document types: `pension_annual` and `study_fund_annual`. A required-document row SHALL count as the Phoenix pension document when its name mentions Phoenix (הפניקס / פניקס / Phoenix, any case) and a pension or provident fund (פנסיה or גמל) and not a study fund; it SHALL count as the Phoenix study-fund document when its name mentions Phoenix and קרן השתלמות / השתלמות. The fetch SHALL be offerable when at least one of the two kinds has a pending row. Unlike Altshuler Shaham, the client's consent is to the fetch itself, not per document type: one login SHALL always take both kinds for the tax year, whatever the checklist holds, and the agent's prompt block for Phoenix SHALL say so (no per-document choice; the document-keys field is ignored for Phoenix).

#### Scenario: Pending Phoenix study fund makes the fetch offerable
- **WHEN** a client with a resolvable national id and a WhatsApp number has a pending required document named "אישור יתרת קרן השתלמות ליום 31.12.2025 — הפניקס"
- **THEN** the Phoenix provider is available, the agent's prompt carries a Phoenix block listing the study-fund type as pending, and the agent may offer the fetch instead of asking for an upload

#### Scenario: Both Phoenix documents pending
- **WHEN** the client has pending Phoenix pension and study-fund rows and agrees to the fetch
- **THEN** one login session fetches both types and both checklist rows are satisfied by the delivered files

#### Scenario: Only the pension is on the list
- **WHEN** the client has a pending Phoenix pension row and no Phoenix study-fund row, and agrees to the fetch
- **THEN** the session's document set is still both kinds, and the site's study-fund annual documents for the year are downloaded as well

#### Scenario: Non-Phoenix documents are untouched
- **WHEN** the only pending study-fund row names Harel
- **THEN** the Phoenix provider is not available and no Phoenix block is added to the prompt

### Requirement: Phoenix login uses the client's national id and WhatsApp number with an SMS code
The Phoenix login SHALL be performed with the client's national id (identity type ת.ז) and the client's WhatsApp number in local 05X form, and SHALL request the one-time code by SMS to that number. The provider's code channel SHALL be reported as SMS, so the agent tells the client to look for an SMS. When the site rejects the code and still shows the code screen, the platform SHALL treat it as a rejected code and let the client send a new one; when the personal area does not load within the wait, the login SHALL fail with the canned login-failed message.

The Phoenix login SHALL run through the outbound proxy configured for the `phoenix` provider (an Israeli ISP address, see `fetch-egress-proxy`), because the Phoenix login script is not served to the platform's own Azure address. When no proxy is configured for Phoenix, the session SHALL still be attempted directly, and its evidence SHALL show the direct route, so a login that fails because the login form never appeared can be read as an egress problem rather than a selector problem.

#### Scenario: Code is sent by SMS
- **WHEN** the worker starts a Phoenix login for a client who agreed
- **THEN** the site sends the code by SMS to the client's WhatsApp number and the client receives the canned "the code was just sent by SMS from הפניקס" message

#### Scenario: Wrong code can be retried
- **WHEN** the client forwards a wrong code and the site keeps the code screen up
- **THEN** the client receives the canned rejected-code message and may send another code within the session's wait

#### Scenario: Login form appears through the proxy
- **WHEN** `DOCUMENT_FETCH_PROXY_PHOENIX` points at a working Israeli ISP proxy and the worker starts a Phoenix login from production
- **THEN** the login page loads its form script, the ID field appears, the credentials are typed and the SMS code is requested, all through the proxy's single exit address

#### Scenario: No proxy configured in production
- **WHEN** `DOCUMENT_FETCH_PROXY_PHOENIX` is not set and the worker starts a Phoenix login from production
- **THEN** the login fails with the canned login-failed message as before, and the session's evidence summary shows the route as direct, with the login-failed step recording the 404 of the login script in its network log

### Requirement: Phoenix documents are selected by sector and report name across every page
After login the platform SHALL open the personal area's reports list ("דוחות ומסמכים" → "דוחות") and SHALL walk every page using the list's page-bar controls only, never the site's sector, type or year filters. From every row it SHALL read the report name and the תחום (sector) column. A row SHALL be taken for `pension_annual` when its sector contains "פנסיה", and for `study_fund_annual` when its sector contains "השתלמות", in both cases only when the report name contains the tax year as a four-digit string and does not contain "רבעון". The row's date column SHALL NOT be used for the year decision. Every taken row SHALL be downloaded, including rows with identical names (a client may hold several policies with the same report name). Both kinds SHALL always be taken (the session's document set is both).

#### Scenario: Study fund and pension for 2024
- **WHEN** the tax year is 2024 and the list holds "דוח שנתי מלא 2024" and "דוח שנתי מקוצר ואישור מס 2024" under גמל והשתלמות plus "דוח מפורט לשנת 2024" under חיים/פנסיה
- **THEN** all three documents are downloaded, the first two tagged `study_fund_annual` and the third `pension_annual`

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
- **WHEN** the login worked, every page was walked, and no row of either kind matched the tax year
- **THEN** the session ends with the "no documents on the site" outcome and the client receives the canned Phoenix no-documents message, and the agent is told not to retry blindly

### Requirement: A fetched kind with no Phoenix row creates its own checklist row
When the delivery of a Phoenix session holds files of a kind for which the client has no Phoenix row of that kind (pension: catalog type "pension or provident fund"; study fund: catalog type "study fund") in any status other than retired or not needed, code SHALL create that row without any planner proposal or client words: the client's catalog row of that type is settled as needed when it is still open or marked as not needed, otherwise a new item is added under it. The row's name SHALL be the catalog name of the type for the tax year with "— הפניקס" appended (for example "אישור יתרת קרן השתלמות ליום 31.12.2024 — הפניקס"). All fetched files of that kind SHALL be attached to the row, the row marked received, and the files verified like any fetched document. The row's evidence SHALL name the fetch session, the provider and the first attached file; the documents tab SHALL show that the row was created from a document the platform fetched from הפניקס; the audit trail SHALL record the creation. When the client already has a Phoenix row of that kind, the files SHALL be attached to it as today and no row is created.

The WhatsApp confirmation SHALL add, after the fetched-what sentence, one sentence per created kind telling the client that this document was also found at הפניקס and added to the list. The follow-up reply after verification SHALL report it like any received document.

#### Scenario: Study fund found that was not on the list
- **WHEN** the client has a pending Phoenix pension row, no study-fund item at all (the study-fund catalog row is still open), and the fetch downloads two study-fund documents and one pension document for the year
- **THEN** the pension document is attached to the pension row; the study-fund catalog row is settled as needed with the name "אישור יתרת קרן השתלמות ליום 31.12.2024 — הפניקס", both study-fund files are attached to it and it is marked received; the confirmation says the study fund was also found at הפניקס and added to the list; the documents tab shows the row was created from a fetched document

#### Scenario: Study fund settled as not needed from the questionnaire
- **WHEN** the client answered the questionnaire that they have no study fund, and the Phoenix fetch finds study-fund documents for the year
- **THEN** the study-fund row is settled as needed with the Phoenix name and the files attached, as in the first scenario

#### Scenario: Study fund of another company already on the list
- **WHEN** the list already holds the pending item "קרן השתלמות — אלטשולר שחם" and the Phoenix fetch finds study-fund documents
- **THEN** a new item "אישור יתרת קרן השתלמות ליום 31.12.2024 — הפניקס" is added next to it with the files attached; the Altshuler item is untouched

#### Scenario: Phoenix row already exists
- **WHEN** the list holds a pending Phoenix study-fund row and the fetch finds study-fund documents
- **THEN** the files are attached to that row and no row is created

#### Scenario: Nothing extra found
- **WHEN** the fetch finds only the kind that is on the list
- **THEN** no row is created and the confirmation carries no "also found" sentence

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
