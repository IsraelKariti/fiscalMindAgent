## Purpose
An item of an institution-bound type (bank, fund, policy) whose name identifies no company cannot be matched to a fetch website and cannot have its company compared with a file's issuer. This capability has the agent ask the client which company manages the item and rename the item on the client's words, so the existing website fetch and company matching can find it.

## ADDED Requirements

### Requirement: The prompt marks an item whose company is unknown
For every pending required-document row of an institution-bound catalog type whose name identifies no company of the institutions table, the planner prompt SHALL carry, on that row's line, a note that the company is unknown and that the agent must ask the client which company manages it. The note SHALL list, by site name, every fetch website that would become offerable for this row once it names that company: a site counts when the client could use it now (the site's login identity is resolvable for the client and WhatsApp is allowed) and the row's name with that site's company appended would match one of the site's document types. A row that already names a company, a row of a type that is not institution-bound, and a row that is not pending SHALL carry no such note.

#### Scenario: Fund item from the questionnaire with no company
- **WHEN** the questionnaire mapping created the pending row "אישור יתרת קרן פנסיה ליום 31.12.2025 — קרן פנסיה" for a client with an id number on file and WhatsApp allowed
- **THEN** the row's prompt line says the company is unknown and must be asked, and lists Harel, Migdal, Phoenix, Menora Mivtachim, Meitav and Altshuler Shaham as sites the document could be pulled from once the company is known

#### Scenario: Client without a resolvable id
- **WHEN** the same row belongs to a client with no id number anywhere (no credentials row, no CRM-card id, no questionnaire id)
- **THEN** the line says the company is unknown and must be asked, and lists no site

#### Scenario: Row that names its company
- **WHEN** the pending row is "אישור יתרת קרן השתלמות ליום 31.12.2025 — הראל"
- **THEN** the line carries no company note (and the Harel fetch block appears as today)

#### Scenario: Collected row
- **WHEN** a row of an institution-bound type names no company but is collected or claimed
- **THEN** the line carries no company note

### Requirement: The agent asks which company manages an unknown-company item
When the agent asks the client for a document whose row is marked company-unknown, the agent SHALL ask, in the same message and as one question, which company manages that fund, account or policy — before or together with the request for the document itself, never as a separate later message. When the client's answer names a company whose site is listed on that row, the agent's next reply SHALL say that the document can be pulled from that site for the client (a code sent to the client's phone or email, as the site works) instead of uploaded, as prose — the fetch actions themselves stay available only through the site's fetch block, which appears once the row names the company. When the client does not know the company, the agent SHALL ask for the document as today and SHALL NOT ask the company again in the same conversation unless the client raises it.

#### Scenario: Asking for the pension certificate
- **WHEN** the next document to request is the pension row marked company-unknown
- **THEN** the message asks which company the pension is held with and asks for the certificate, with no second question about any other matter

#### Scenario: Client names a fetchable company
- **WHEN** the client answers "הפנסיה שלי במגדל" and Migdal was listed on the row
- **THEN** the answer records the company on the row (see the next requirement) and the reply says the certificate can be pulled from the Migdal site for the client, asking whether to go ahead, without asking for an upload

#### Scenario: Client names a company with no site
- **WHEN** the client answers "ילין לפידות"
- **THEN** the answer records the company on the row and the reply asks for the certificate as an upload, with no offer to fetch

#### Scenario: Client does not know
- **WHEN** the client answers "לא יודעת באיזו חברה"
- **THEN** the row is not renamed, the reply asks for the certificate as today, and the company is not asked again later

### Requirement: The company is recorded on the row only on the client's quoted words
The planner SHALL have an action that records the company of one row from the client's words: the row id, the company as the client named it, and the evidence (the client's message id and a verbatim quote). The gate SHALL accept it only when the row exists for this client, is pending, is of an institution-bound type, names no company yet, and the quote is verbatim in that inbound message and contains the company text. On acceptance code SHALL rename the row to "<current name> — <company>", where the company is the institutions table's Hebrew label when the client's text identifies a table company and the client's text itself (trimmed, capped) otherwise. The row's id, type, status, description, paper and files SHALL NOT change. One action SHALL set one row; when the client names several companies for one row, the first company is set on the row and every further company is an added instance, as the existing instance rule works. A rejected action SHALL reject the whole answer, as other gate failures do.

#### Scenario: Recognised company
- **WHEN** the planner records the company "מגדל" on the pending row "אישור יתרת קרן פנסיה ליום 31.12.2025 — קרן פנסיה" with the quote "הפנסיה שלי במגדל"
- **THEN** the row is renamed "אישור יתרת קרן פנסיה ליום 31.12.2025 — קרן פנסיה — מגדל", keeps its id and status, and the planner's next run shows the Migdal fetch block with the pension type pending

#### Scenario: Company not in the table
- **WHEN** the client answers "הקרן בחברת זמיר" and the planner records the company "זמיר"
- **THEN** the row is renamed "… — זמיר", the audit detail says the company is not in the table, and no fetch block appears

#### Scenario: Two companies for one row
- **WHEN** the client answers "יש לי קרן השתלמות בהראל וגם במיטב" and the row is one study-fund row with no company
- **THEN** the answer records Harel on the row and adds an instance named with Meitav under the same catalog row, both with the quote as evidence

#### Scenario: Row already names a company
- **WHEN** the planner records a company on a row named "… — הראל"
- **THEN** the gate rejects the answer with a note that the row already names a company

#### Scenario: Quote without the company
- **WHEN** the planner records "מגדל" with the quote "כן, אשלח"
- **THEN** the gate rejects the answer with a note that the quote does not name the company

#### Scenario: Row not pending
- **WHEN** the row is collected
- **THEN** the gate rejects the answer with a note that only a pending row can take a company

### Requirement: The renamed row behaves as a row that named the company from the start
After the rename, the file-company comparison, the per-company split, the employer split and the fetch matching SHALL treat the row exactly as a row the client agreed with that company in its name: a file of another company is refused for it, a fetch website whose company it names becomes offerable for it, and an employer sibling keeps the company part of the name.

#### Scenario: File of another company after the rename
- **WHEN** the row was renamed with Migdal and the client sends a Harel pension report
- **THEN** the tie is refused because the companies differ, as for a row that named Migdal from the start

#### Scenario: Fetch after the rename
- **WHEN** the row was renamed with Migdal, the client has a resolvable id and the conversation is live on WhatsApp
- **THEN** the Migdal provider is available for the client and the agent may offer, agree and start the login as the `migdal-fetch` capability describes
