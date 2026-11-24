## MODIFIED Requirements

### Requirement: A list item is created only on the client's quoted words
Every planner proposal that makes a list item needed — settling an open question as needed, or adding an item to a type that is already settled — SHALL carry evidence: the id of a stored inbound message of this client and a quote that appears verbatim in that message's text. The decision gate SHALL reject a proposal without evidence, with a message id that is not a stored inbound message of the client, or with a quote that is not found in that message, and the rejection SHALL be reported through the `business_rules` check of `validate_message`. Text from a received file, from a file name, from the online questionnaire or from the agent's own messages SHALL NOT be accepted as evidence. The accepted evidence SHALL be stored with the created items and shown in the step's detail. Items created by the office's own processing of the online questionnaire and items the accountant adds by hand are not planner proposals and are not affected. Three exceptions exist, all decided by code: the per-company and per-employer split of an item (requirement "An item that names no company is split per company when files are tied to it"), which divides an item the client already agreed to and carries the creating file as its evidence; a self-evident file in the client's or spouse's name (requirement "A self-evident file creates its item without a client quote"), which the planner cites instead of a quote and which the gate accepts only from the code-built pool; and a document the platform itself fetched from the client's own login at an external site (openspec `phoenix-fetch`, requirement "A fetched kind with no Phoenix row creates its own checklist row"), which creates the row of its kind at delivery time with the fetch session and file as its evidence.

#### Scenario: File alone
- **WHEN** the client's only new message carried a Harel certificate with no text whose holder name is hidden, and the planner proposes to add a Harel item
- **THEN** the gate rejects the answer because the proposal has no valid evidence, and no item is created

#### Scenario: Client confirms in words
- **WHEN** the client writes "כן, יש לי גם קרן השתלמות בהראל" and the planner adds a Harel item quoting these words with that message's id
- **THEN** the gate accepts the answer and the item is created with the quote stored on it

#### Scenario: Words arrive together with the file
- **WHEN** the client sends the Harel certificate and, in the same turn, the text "מצרף גם את הקרן בהראל ששכחתי להזכיר"
- **THEN** the planner may add the Harel item in that turn, quoting that text

#### Scenario: Quote taken from the file's analysis
- **WHEN** the planner's evidence quote appears in the file's content analysis but in no inbound message text
- **THEN** the gate rejects the answer

#### Scenario: Interview answer
- **WHEN** the client answers the agent's question "how many bank accounts did you have?" with "שניים, לאומי ודיסקונט" and the planner settles the bank item as needed with two items, quoting this answer
- **THEN** the gate accepts the answer, as the interview worked before, now with the quote stored

#### Scenario: File alone splits an agreed item
- **WHEN** the client's only new message carried Harel and Clal executive-insurance files with no text, both tied to the agreed item "ביטוח מנהלים ניב"
- **THEN** no planner proposal is needed: code renames the item for Harel and creates the Clal item with the Clal file as its evidence

#### Scenario: Files alone split an agreed fund by employer
- **WHEN** the client's only new message carried three Meitav study fund reports of three employers with no text, all tied to the agreed item "קרן השתלמות ניב — מיטב"
- **THEN** no planner proposal is needed: code renames the item for the first employer and creates two items for the other employers, each with its file and employer as evidence

#### Scenario: File alone in the client's name
- **WHEN** the client's only new message carried a Phoenix study fund report in his own name, confidence high, and the planner settles the study fund row as needed citing that file
- **THEN** the gate accepts the answer and the item is created with the file as its evidence

#### Scenario: Document the platform fetched itself
- **WHEN** a Phoenix fetch session delivers study-fund documents for a client whose list holds no Phoenix study-fund row
- **THEN** no planner proposal is needed: code creates the Phoenix study-fund row at delivery with the session and file as its evidence
