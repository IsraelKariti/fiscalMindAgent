## ADDED Requirements

### Requirement: An item that names no company is split per company when files are tied to it
When the planner's cycle ties one or more files to a list item of an institution-bound type (bank balance, securities portfolio, pension or provident fund, study fund, life-insurance savings, mortgage balance) that names no company the institutions table knows, and the company printed on a tied file is recognised as exactly one company of that table, code SHALL give every such file an item that names its company: the item itself SHALL be renamed to its name followed by " — " and the Hebrew table name of the first recognised company (in the order the files are tied), and for every further recognised company one sibling item SHALL be created with the same type, the same description and the same name pattern, in pending status. Each file SHALL be tied to the item of its company; files of the same company share one item. A tied file whose company is not recognised SHALL stay on the original item (renamed or not) and SHALL NOT create an item. The rename and the sibling inserts SHALL happen atomically, before the cycle decides which items are collected, so that each resulting item is collected on its own file and verified against that file alone.

The created items are not planner proposals: they SHALL carry, as their evidence, the id of the file that created them and the issuer printed on it, and they SHALL NOT need a client quote. The rule SHALL NOT add an item of a type or for a person the client did not agree to: it only divides an item the client already has among the companies of the files received for it. The names of the renamed and created items SHALL be built from the item's existing name and the institutions table only; the model's free text and text from the file SHALL NOT be used. An item that already names a company, an item of a type that is not institution-bound, and a tie to an item created in the same cycle on the client's words SHALL NOT be affected. After the split every resulting item names a company, so a later file of another company matches none of them and is handled as an unmatched file (the agent asks the client).

The `apply_collections` step SHALL record the split: the renamed item with its old and new name, and every created item with its name and the file that created it. The audit trail SHALL record the created items like other item creations, with the file-based evidence.

#### Scenario: Three companies for one item
- **WHEN** the planner ties three children of one PDF, from Harel, Clal and Migdal, to the item "ביטוח מנהלים ניב", which names no company
- **THEN** the item is renamed "ביטוח מנהלים ניב — הראל" with the Harel file, the items "ביטוח מנהלים ניב — כלל" and "ביטוח מנהלים ניב — מגדל" are created with the Clal and Migdal files, all three are collected and each is verified against its own file

#### Scenario: Several files of one company
- **WHEN** the planner ties three Meitav study fund files and one Mor file to the item "קרן השתלמות ניב"
- **THEN** the item is renamed "קרן השתלמות ניב — מיטב" and holds the three Meitav files, and one item "קרן השתלמות ניב — מור" is created for the Mor file

#### Scenario: One file of one company
- **WHEN** the planner ties one Harel file to the item "קרן השתלמות ניב"
- **THEN** the item is renamed "קרן השתלמות ניב — הראל", no item is created, and the file is attached to it

#### Scenario: A file of an unrecognised company
- **WHEN** the planner ties, on the client's quoted words, a file whose company is not in the institutions table to the item "קרן השתלמות ניב", and no other file is tied to that item
- **THEN** the item keeps its name, no item is created, and the file is attached to it

#### Scenario: Item that names a company
- **WHEN** the planner ties a Harel file to the item "אישור יתרת קרן השתלמות ליום 31.12.2025 — הראל"
- **THEN** nothing is renamed or created

#### Scenario: A later file of another company
- **WHEN** after the split the client sends a Phoenix executive-insurance file in a new message
- **THEN** the classifier matches it to none of the company-named items, the file ends unmatched, and the agent asks the client about it as today

#### Scenario: Trace and audit
- **WHEN** the split of "ביטוח מנהלים ניב" into three items happens
- **THEN** the `apply_collections` step detail lists the rename (old name, new name) and the two created items with their names and the files that created them, and each created item is audited with the file id and the printed issuer as evidence

## MODIFIED Requirements

### Requirement: A list item is created only on the client's quoted words
Every planner proposal that makes a list item needed — settling an open question as needed, or adding an item to a type that is already settled — SHALL carry evidence: the id of a stored inbound message of this client and a quote that appears verbatim in that message's text. The decision gate SHALL reject a proposal without evidence, with a message id that is not a stored inbound message of the client, or with a quote that is not found in that message, and the rejection SHALL be reported through the `business_rules` check of `validate_message`. Text from a received file, from a file name, from the online questionnaire or from the agent's own messages SHALL NOT be accepted as evidence. The accepted evidence SHALL be stored with the created items and shown in the step's detail. Items created by the office's own processing of the online questionnaire and items the accountant adds by hand are not planner proposals and are not affected. The one code-made exception is the per-company split of an item that names no company (requirement "An item that names no company is split per company when files are tied to it"): it divides an item the client already agreed to among the companies of the files tied to it, creates no new document type and no new person, and carries the creating file as its evidence.

#### Scenario: File alone
- **WHEN** the client's only new message carried a Harel certificate with no text, and the planner proposes to add a Harel item
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
