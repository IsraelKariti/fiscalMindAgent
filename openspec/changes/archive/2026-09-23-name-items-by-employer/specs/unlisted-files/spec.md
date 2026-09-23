## MODIFIED Requirements

### Requirement: The file check reports the accounts and policies a file shows
For a file whose document type is always issued by a financial institution (bank balance, securities portfolio, pension or provident fund, study fund, life-insurance savings, mortgage balance), the file classifier SHALL report the list of accounts, funds or policies that the file shows. For each one it SHALL report the product as printed on the file, the holder's name as printed or that no name is readable (absent or hidden), and the account or policy number as printed or that none is printed. The classifier SHALL report only what is printed on the file: it SHALL NOT take a holder's name, a number or a count from the file name, from the list of required documents or from a guess. A file of another document type, and a file where no account or policy can be told apart, SHALL report an empty list. The list SHALL hold at most 20 entries; when the file shows more, the analysis SHALL say that the list is partial.

For a file of an employer-bound document type (study fund, pension or provident fund — funds that are opened per employer), the classifier SHALL also report the employer of the fund as printed on the file (the "שם המעסיק" line of a fund report), or that no employer is printed, or that the file shows accounts of two or more different employers (then no employer is reported). The employer SHALL be taken from the file only, never from the file name, the list of required documents or a guess. Code SHALL clean the reported employer before any use: invisible and control characters removed, whitespace collapsed, the platform's name separator (" — ") replaced by a plain dash, at most 60 characters, and at least one letter; an employer that fails this cleaning SHALL count as not printed. For a file of any other document type the employer SHALL be absent.

The planner SHALL see, on the file's analysis line, how many accounts or policies the file shows and, for each, the product, the holder's name (or that it is hidden) and only the last 4 characters of the number (the full number stays in the stored analysis), and, for an employer-bound type, the cleaned employer when one was reported. These texts come from the file, so they SHALL be cleaned like every other text taken from a file before they enter the planner's input, and a quarantined file SHALL show none of them. The list and the employer SHALL NOT change any verdict of `validate_classification`, SHALL NOT tie a file to an item, and SHALL NOT be accepted as evidence for creating a list item. An analysis stored before this requirement existed has no list and no employer; it SHALL keep working and SHALL be shown to the planner without them.

#### Scenario: Two policies with two holders
- **WHEN** a Clal report shows one managers-insurance policy in the name "תמיר ניב" and one in the name "מיכל ניב"
- **THEN** the file's analysis lists two policies, each with its product, holder name and policy number, and the planner's file line says that the file shows 2 policies and names both holders

#### Scenario: Holder name hidden
- **WHEN** a Yelin Lapidot study fund report shows two accounts and the member's name and id are blacked out
- **THEN** the analysis lists two accounts whose holder is marked as hidden, and the planner's file line says so

#### Scenario: File of another type
- **WHEN** the file is a vehicle licence
- **THEN** the analysis reports an empty list and the planner's file line shows no account list

#### Scenario: Name taken from the list instead of the file
- **WHEN** the file prints no holder name and the required-documents list holds an item named "ביטוח מנהלים ניב"
- **THEN** the analysis marks the holder as hidden, not as "ניב"

#### Scenario: Quarantined file
- **WHEN** the file is judged to hold instruction-like text addressed at an AI
- **THEN** the planner sees the quarantine warning only, with no account list

#### Scenario: Analysis stored before the list existed
- **WHEN** the planner cycle runs for a client whose files were analysed before this requirement
- **THEN** the file lines are shown as before, without an account list, and the cycle does not fail

#### Scenario: The list is not evidence
- **WHEN** the planner proposes a new item and its evidence quote appears only in a file's account list
- **THEN** the gate rejects the answer, as for any quote taken from a file's analysis

#### Scenario: Study fund report with an employer
- **WHEN** a Meitav study fund report prints "שם המעסיק: פרייסמנס בע"מ" on its first page and its tax certificate lists three account numbers
- **THEN** the analysis reports the employer "פרייסמנס בע"מ" next to the accounts list, and the planner's file line shows "employer: פרייסמנס בע"מ"

#### Scenario: Report of several employers
- **WHEN** a pension report shows two funds, each with a different employer
- **THEN** the analysis reports no employer

#### Scenario: Employer on a file of another type
- **WHEN** a bank balance certificate mentions the client's employer in a salary line
- **THEN** the analysis reports no employer and the planner's file line shows none

#### Scenario: Employer text that fails cleaning
- **WHEN** the reported employer is longer than 60 characters, or holds only digits and symbols
- **THEN** it counts as not printed: it is not shown to the planner and is not used in any name

### Requirement: An item that names no company is split per company when files are tied to it
When the planner's cycle ties one or more files to a list item of an institution-bound type (bank balance, securities portfolio, pension or provident fund, study fund, life-insurance savings, mortgage balance) that names no company the institutions table knows, and the company printed on a tied file is recognised as exactly one company of that table, code SHALL give every such file an item that names its company: the item itself SHALL be renamed to its name followed by " — " and the Hebrew table name of the first recognised company (in the order the files are tied), and for every further recognised company one sibling item SHALL be created with the same type, the same description and the same name pattern, in pending status. Each file SHALL be tied to the item of its company; files of the same company share one item. A tied file whose company is not recognised SHALL stay on the original item (renamed or not) and SHALL NOT create an item.

For an item of an employer-bound type (study fund, pension or provident fund), code SHALL then divide the files of each resulting item by employer in the same way: when a tied file reports a cleaned employer (requirement "The file check reports the accounts and policies a file shows") and the item's name does not already contain that employer text, the item SHALL be renamed to its name followed by " — " and the first such employer (in the order the files are tied), and every further different employer SHALL get one sibling item with the same type, the same description and the same name pattern, in pending status; files of one employer share one item, and each file SHALL be tied to the item of its employer. A tied file that reports no employer SHALL stay on the item it was tied to and SHALL NOT create an item. This employer step SHALL run whether or not the company step renamed the item, so an item that already names a company (such as "אישור יתרת קרן השתלמות ליום 31.12.2025 — ניב — מיטב") is divided by employer too; an item that already names an employer keeps a file of that employer and SHALL get a sibling for a file of another employer. Two files SHALL count as the same employer when their cleaned employer texts are equal ignoring case and repeated spaces. The company step SHALL NOT be applied to items of a type that is not institution-bound, and the employer step SHALL NOT be applied to items of a type that is not employer-bound.

The renames and the sibling inserts SHALL happen atomically, before the cycle decides which items are collected, so that each resulting item is collected on its own file and verified against that file alone.

The created items are not planner proposals: they SHALL carry, as their evidence, the id of the file that created them, the issuer printed on it and, for an employer sibling, the cleaned employer, and they SHALL NOT need a client quote. The rule SHALL NOT add an item of a type or for a person the client did not agree to: it only divides an item the client already has among the companies and employers of the files received for it. The names of the renamed and created items SHALL be built from the item's existing name, the institutions table and the cleaned employer only; the model's free text about the file (its description, its summary, the issuer as the model wrote it) SHALL NOT be used. An item of a type that is not institution-bound, and a tie to an item created in the same cycle on the client's words, SHALL NOT be affected. After the company step every resulting item names a company, so a later file of another company matches none of them and is handled as an unmatched file (the agent asks the client); a later file of the same company but another employer matches a company item of that type, and the employer step gives it its own sibling without a question to the client.

The `apply_collections` step SHALL record the split: the renamed item with its old and new name, and every created item with its name, the file that created it and, for an employer sibling, the employer. The audit trail SHALL record the created items like other item creations, with the file-based evidence and whether the company or the employer created them.

#### Scenario: Three companies for one item
- **WHEN** the planner ties three children of one PDF, from Harel, Clal and Migdal, to the item "ביטוח מנהלים ניב", which names no company
- **THEN** the item is renamed "ביטוח מנהלים ניב — הראל" with the Harel file, the items "ביטוח מנהלים ניב — כלל" and "ביטוח מנהלים ניב — מגדל" are created with the Clal and Migdal files, all three are collected and each is verified against its own file

#### Scenario: Several files of one company
- **WHEN** the planner ties three Meitav study fund reports, whose employers are "פרייסמנס בע"מ", "גילת רשתות לווין בע"מ" and "ראנדקום בע"מ", and one Mor report with no printed employer, to the item "קרן השתלמות ניב"
- **THEN** the item is renamed "קרן השתלמות ניב — מיטב — פרייסמנס בע"מ" and holds the first Meitav file, the items "קרן השתלמות ניב — מיטב — גילת רשתות לווין בע"מ" and "קרן השתלמות ניב — מיטב — ראנדקום בע"מ" are created for the other two Meitav files, the item "קרן השתלמות ניב — מור" is created for the Mor file, and each of the four is collected and verified against its own file

#### Scenario: Item that already names the company
- **WHEN** the planner ties the same three Meitav reports to the item "אישור יתרת קרן השתלמות ליום 31.12.2025 — ניב — מיטב"
- **THEN** the company step changes nothing, and the employer step renames the item "אישור יתרת קרן השתלמות ליום 31.12.2025 — ניב — מיטב — פרייסמנס בע"מ" and creates the two sibling items for the other employers

#### Scenario: Files of one company and no employer
- **WHEN** the planner ties two Meitav reports that print no employer to the item "קרן השתלמות ניב"
- **THEN** the item is renamed "קרן השתלמות ניב — מיטב" and holds both files, and no item is created

#### Scenario: One file of one company
- **WHEN** the planner ties one Harel file with no printed employer to the item "קרן השתלמות ניב"
- **THEN** the item is renamed "קרן השתלמות ניב — הראל", no item is created, and the file is attached to it

#### Scenario: One file with an employer
- **WHEN** the planner ties one Harel study fund report whose employer is "אלביט מערכות בע"מ" to the item "קרן השתלמות ניב"
- **THEN** the item is renamed "קרן השתלמות ניב — הראל — אלביט מערכות בע"מ", no item is created, and the file is attached to it

#### Scenario: Employer on a type that is not employer-bound
- **WHEN** the planner ties two Clal executive-insurance files that each print a different employer to the item "ביטוח מנהלים ניב"
- **THEN** the item is renamed "ביטוח מנהלים ניב — כלל" and holds both files, and no employer is added to any name

#### Scenario: A file of an unrecognised company
- **WHEN** the planner ties, on the client's quoted words, a file whose company is not in the institutions table to the item "קרן השתלמות ניב", and no other file is tied to that item
- **THEN** the item keeps its name, no item is created, and the file is attached to it

#### Scenario: Item that names a company
- **WHEN** the planner ties a Meitav report whose employer is "פרייסמנס בע"מ" to the item "קרן השתלמות ניב — מיטב — פרייסמנס בע"מ"
- **THEN** nothing is renamed or created

#### Scenario: A later file of another company
- **WHEN** after the split the client sends a Phoenix executive-insurance file in a new message
- **THEN** the classifier matches it to none of the company-named items, the file ends unmatched, and the agent asks the client about it as today

#### Scenario: A later file of the same company and a new employer
- **WHEN** after the split the client sends a fourth Meitav study fund report whose employer is "טבע בע"מ", and the classifier matches it to "קרן השתלמות ניב — מיטב — פרייסמנס בע"מ"
- **THEN** the match is kept (same company), and the tie creates the item "קרן השתלמות ניב — מיטב — טבע בע"מ" for the file without asking the client

#### Scenario: Trace and audit
- **WHEN** the split of "קרן השתלמות ניב" into the three Meitav items and the Mor item happens
- **THEN** the `apply_collections` step detail lists the rename (old name, new name) and the three created items with their names, the files that created them and, for the two Meitav siblings, their employers; each created item is audited with the file id, the printed issuer and, for the Meitav siblings, the employer as evidence, and the audit row says whether the company or the employer created it

### Requirement: A list item is created only on the client's quoted words
Every planner proposal that makes a list item needed — settling an open question as needed, or adding an item to a type that is already settled — SHALL carry evidence: the id of a stored inbound message of this client and a quote that appears verbatim in that message's text. The decision gate SHALL reject a proposal without evidence, with a message id that is not a stored inbound message of the client, or with a quote that is not found in that message, and the rejection SHALL be reported through the `business_rules` check of `validate_message`. Text from a received file, from a file name, from the online questionnaire or from the agent's own messages SHALL NOT be accepted as evidence. The accepted evidence SHALL be stored with the created items and shown in the step's detail. Items created by the office's own processing of the online questionnaire and items the accountant adds by hand are not planner proposals and are not affected. The one code-made exception is the per-company and per-employer split of an item (requirement "An item that names no company is split per company when files are tied to it"): it divides an item the client already agreed to among the companies and employers of the files tied to it, creates no new document type and no new person, and carries the creating file as its evidence.

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

#### Scenario: Files alone split an agreed fund by employer
- **WHEN** the client's only new message carried three Meitav study fund reports of three employers with no text, all tied to the agreed item "קרן השתלמות ניב — מיטב"
- **THEN** no planner proposal is needed: code renames the item for the first employer and creates two items for the other employers, each with its file and employer as evidence
