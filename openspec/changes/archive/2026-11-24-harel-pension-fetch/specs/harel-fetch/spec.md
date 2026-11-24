## ADDED Requirements

### Requirement: Harel fetch offers pension and study-fund annual documents in one login
The platform SHALL register a fetch provider with id `harel` and site name "הראל" that offers two document types: `pension_annual` and `study_fund_annual`. A required-document row SHALL count as the Harel study-fund document when its name mentions Harel (הראל) and קרן השתלמות / השתלמות; it SHALL count as the Harel pension document when its name mentions Harel and a pension or provident fund (פנסיה or גמל) and not a study fund. The fetch SHALL be offerable when at least one of the two kinds has a pending row. The client's consent is to the fetch itself, not per document type: one login SHALL always take both kinds for the tax year, whatever the checklist holds, and the agent's prompt block for Harel SHALL say so (no per-document choice; the document-keys field is ignored for Harel).

#### Scenario: Pending Harel study fund makes the fetch offerable
- **WHEN** a client with a resolvable national id and a WhatsApp number has a pending required document named "אישור יתרת קרן השתלמות ליום 31.12.2025 — הראל"
- **THEN** the Harel provider is available, the agent's prompt carries a Harel block listing the study-fund type as pending and the pension type by its status, and the agent may offer the fetch instead of asking for an upload

#### Scenario: Pending Harel pension alone makes the fetch offerable
- **WHEN** the client's only pending Harel row is "אישור יתרות קופות גמל ופנסיה ליום 31.12.2025 — הראל"
- **THEN** the Harel provider is available and the agent may offer the fetch

#### Scenario: Both kinds pending
- **WHEN** the client has pending Harel pension and study-fund rows and agrees to the fetch
- **THEN** one login session fetches both kinds and both rows are satisfied by the delivered files

#### Scenario: Only the study fund is on the list
- **WHEN** the client has a pending Harel study-fund row and no Harel pension row, and agrees to the fetch
- **THEN** the session's document set is still both kinds, and the site's pension annual reports for the year are downloaded as well

#### Scenario: Non-Harel documents are untouched
- **WHEN** the only pending pension row names Phoenix
- **THEN** the Harel provider is not available and no Harel block is added to the prompt

### Requirement: Harel documents are taken per sector with the site's own filters
After login the platform SHALL open the annual-reports app as today and SHALL run its filter once per kind in the same session: the תחום (sector) option "גמל והשתלמות" for `study_fund_annual`, and the תחום option whose label contains "פנסיה" for `pension_annual`, each with the period "שנתי" and the tax year picked by its visible label. Every row each filter produces SHALL be downloaded (no matching by document name), across every result page, with rows deduplicated by the site's document id within the session. Rows from the study-fund filter SHALL be tagged `study_fund_annual` and rows from the pension filter `pension_annual`. When the תחום dropdown holds no option whose label contains "פנסיה", the fetch SHALL fail with an error that lists the option labels it saw, and SHALL NOT silently download another sector. When a filter is answered by the site and the table stays empty, that kind is simply absent for the client; the session SHALL end with the "no documents on the site" outcome only when both filters come back empty.

#### Scenario: Client holds both kinds
- **WHEN** the tax year is 2025, the study-fund filter lists two rows and the pension filter lists one row
- **THEN** three documents are downloaded, two tagged `study_fund_annual` and one `pension_annual`

#### Scenario: Client holds only a study fund
- **WHEN** the study-fund filter lists rows and the pension filter is answered with an empty table
- **THEN** the study-fund documents are delivered and the session succeeds; no "no documents" message is sent

#### Scenario: Nothing for the year
- **WHEN** both filters are answered and both tables stay empty
- **THEN** the session ends with the "no documents on the site" outcome and the client receives the canned Harel no-documents message naming both products

#### Scenario: Pension option missing from the dropdown
- **WHEN** the תחום dropdown holds no option containing "פנסיה"
- **THEN** the fetch fails with the download-failed outcome and the error text lists the dropdown's option labels

### Requirement: A fetched kind with no Harel row creates its own checklist row
When the delivery of a Harel session holds files of a kind for which the client has no Harel row of that kind (pension: catalog type "pension or provident fund"; study fund: catalog type "study fund") in any status other than retired or not needed, code SHALL create that row the way `phoenix-fetch` does: the client's catalog row of that type is settled as needed when it is still open or marked as not needed, otherwise a new item is added under it. The row's name SHALL be the catalog name of the type for the tax year with "— הראל" appended. All fetched files of that kind SHALL be attached to the row, the row marked received, and the files verified like any fetched document. The row's evidence SHALL name the fetch session, the provider and the first attached file; the documents tab SHALL show that the row was created from a document the platform fetched from הראל; the audit trail SHALL record the creation. The WhatsApp confirmation SHALL add, after the fetched-what sentence, one sentence per created kind telling the client that this document was also found at הראל and added to the list.

#### Scenario: Pension found that was not on the list
- **WHEN** the client has a pending Harel study-fund row, no pension item at all, and the fetch downloads two study-fund documents and one pension document for 2025
- **THEN** the study-fund documents are attached to the study-fund row; the pension catalog row is settled as needed with the name "אישור יתרות קופות גמל ופנסיה ליום 31.12.2025 — הראל" (the catalog name of the pension type for the year), the pension file is attached to it and it is marked received; the confirmation says the pension was also found at הראל and added to the list

#### Scenario: Harel row already exists
- **WHEN** the list holds a pending Harel pension row and the fetch finds pension documents
- **THEN** the files are attached to that row and no row is created

#### Scenario: Nothing extra found
- **WHEN** the fetch finds only the kind that is on the list
- **THEN** no row is created and the confirmation carries no "also found" sentence

### Requirement: Harel delivery wording names the product fetched
The WhatsApp confirmation, the email subject and body, and the file labels SHALL name the product fetched (הפנסיה / קרן ההשתלמות, both when both were fetched) and SHALL list the per-document titles when more than one file was fetched. A file label SHALL be the on-site document type and account (as today) followed by "— הראל" and the tax year.

#### Scenario: Pension and study fund delivered
- **WHEN** one pension report and two study-fund reports are delivered for 2025
- **THEN** the WhatsApp line says three annual reports of the pension and the study fund were fetched from הראל, the email subject names both products, and each file label ends with "— הראל 2025"

#### Scenario: Only study fund delivered
- **WHEN** only study-fund reports are delivered
- **THEN** the wording names the study fund only, as today

### Requirement: Harel pension shows as built on the site-access screen
The admin site-access screen SHALL show the הראל pension card as built once the provider offers `pension_annual`, with no catalog change.

#### Scenario: Built badge
- **WHEN** an admin opens the site-access screen after the change
- **THEN** the הראל card under pension and the הראל card under study funds both carry the built badge
