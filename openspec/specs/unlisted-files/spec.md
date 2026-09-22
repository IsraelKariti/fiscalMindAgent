# unlisted-files Specification

## Purpose
How the capital-declaration agent treats a received file that belongs to no item already agreed with the client: the file stays unattached, the agent asks the client about it, and a list item is created only on the client's own quoted words — after which the waiting file is attached to the new item and verified in the same turn.

## Requirements

### Requirement: The file check matches a file only to items agreed with the client
The file classifier SHALL be offered as match candidates only the list items a file can satisfy: items that were agreed with the client as needed, in any state of collection (waiting, claimed, received, approved). Items that are still an open question, items settled as not needed, and items that were replaced SHALL NOT be offered, and a match to one of them SHALL be dropped by `validate_classification` like any id the classifier was not shown. The classifier SHALL still name the file's document type from the closed list of types, whether or not any item was matched. The classifier's instructions SHALL state that an item names a specific institution, account or asset, and that a file of another bank, fund, insurer, company or asset is not a match for it, even when the document type is the same.

#### Scenario: Type never discussed
- **WHEN** the client sends a pension fund report and the pension item of the list is still an open question
- **THEN** the file's analysis names the type "pension" and says it matches no document, and the pension item stays an open question

#### Scenario: Another fund of a type already settled
- **WHEN** the list holds an approved item "study fund certificate — Altshuler Shaham" and the client sends a study fund certificate of Harel
- **THEN** the file's analysis says it matches no document

#### Scenario: A resend for an agreed item
- **WHEN** the list holds an approved item for Bank Leumi and the client sends another Bank Leumi balance confirmation
- **THEN** the file may be matched to the Bank Leumi item, as before

#### Scenario: Item settled as not needed
- **WHEN** the client said they have no vehicle, the vehicle item is settled as not needed, and the client later sends a vehicle licence
- **THEN** the file's analysis says it matches no document

### Requirement: Code compares the company of the file with the company of the item
For list items of a document type that is always issued by a financial institution (bank balance, securities portfolio, pension or provident fund, study fund, life-insurance savings, mortgage balance), the file classifier SHALL report the name of the company that issued the file as printed on it, and code SHALL compare companies before a file is tied to such an item. Code SHALL hold a table of known banks, investment houses and insurers, each with its Hebrew and English name forms, and SHALL identify the company of the file from the reported issuer and the company of the item from the item's name. `validate_classification` SHALL keep a match to such an item when both companies are identified and are the same company, and also when the file's company is identified but the item names no company the table knows (an item named after a person or a product only, such as "קרן השתלמות ניב") — the file's document type already had to equal the item's type for the match to reach this check. When the companies differ, or when the file's company cannot be identified, the match SHALL be dropped and the file SHALL end as matching no document. The gate SHALL report this as the check `issuer_matches_item`, with the file's issuer as the observed value and the item's company (or that it is not identified) as the expected value; on a drop the note SHALL say whether the companies differ or that the file's company could not be identified; a match kept because the item names no company SHALL be reported as passed with the expected value "not identified" and no note, so the step detail still shows that the comparison was one-sided; the check SHALL be absent when no item was matched or the matched item's type is not institution-bound. The planner SHALL see, in the file's analysis line, the reported issuer and, when a match was dropped by this check, that it was dropped and why.

The same comparison SHALL guard every tie the planner proposes between a file and an institution-bound item (a file paired with an existing item, and a file named for a new item): a tie between two identified, different companies SHALL always be refused; a tie where the file's company cannot be identified SHALL be accepted only when the proposal carries evidence — a stored inbound message of the client and a verbatim quote from it; a tie where the file's company is identified but the item names no company SHALL be accepted when the file's analysed document type equals the item's type, and refused otherwise. Items of other document types are not affected by this requirement.

#### Scenario: Different companies
- **WHEN** the classifier matches a file whose issuer is "Harel Pension & Gemel" to the item "אישור להצהרת הון — קרן השתלמות באלטשולר שחם"
- **THEN** the match is dropped, the file ends as matching no document, and `issuer_matches_item` is reported failed with observed "Harel", expected "Altshuler Shaham" and a note that the companies differ

#### Scenario: Same company in two name forms
- **WHEN** the file's issuer is "Bank Leumi le-Israel B.M." and the item is "אישור יתרות בנק לאומי ליום 31.12.2025"
- **THEN** the match is kept and `issuer_matches_item` is reported passed

#### Scenario: Company not in the table
- **WHEN** the file's issuer is a small provident fund that the table does not hold
- **THEN** the match is dropped, the note says the file's company could not be identified, and the planner's next reply asks the client about the file

#### Scenario: Item names no company
- **WHEN** the classifier matches a Harel study fund report to the item "אישור יתרת קרן השתלמות ליום 31.12.2025 — קרן השתלמות ניב", which names a person and no company
- **THEN** the match is kept, `issuer_matches_item` is reported passed with observed "Harel", expected "not identified" and no note, and the file's analysis carries no dropped-match reason

#### Scenario: Item names no company and the types differ
- **WHEN** the classifier matches a Harel pension report to the item "קרן השתלמות ניב", which names no company
- **THEN** the match is dropped by the type check as before, and `issuer_matches_item` is absent

#### Scenario: Type that is not institution-bound
- **WHEN** the classifier matches a vehicle licence to the vehicle item
- **THEN** the company check does not run and `issuer_matches_item` is absent

#### Scenario: Planner pairs a file of another company
- **WHEN** the planner pairs the Harel file with the Altshuler Shaham item, with or without a client quote
- **THEN** the pair is refused, the file stays unattached and the item is not marked received because of it

#### Scenario: Planner pairs a file of an unidentified company on the client's words
- **WHEN** the file's company is not in the table, the client wrote "הקובץ ששלחתי הוא מהקופה שלי בגמל הנדסאים", and the planner pairs the file with that item quoting these words
- **THEN** the pair is accepted

#### Scenario: Planner pairs a file of an unidentified company without a quote
- **WHEN** the same pair carries no evidence
- **THEN** the pair is refused and the file stays unattached

#### Scenario: Planner pairs a file with an item that names no company
- **WHEN** the planner pairs a Harel study fund file (analysed type "study fund") with the item "קרן השתלמות ניב", without a client quote
- **THEN** the pair is accepted, the file is attached and the item is marked received

#### Scenario: Planner pairs a file of another type with an item that names no company
- **WHEN** the planner pairs a Harel pension file (analysed type "pension") with the item "קרן השתלמות ניב"
- **THEN** the pair is refused because the types differ, and the file stays unattached

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

### Requirement: The file check reports the accounts and policies a file shows
For a file whose document type is always issued by a financial institution (bank balance, securities portfolio, pension or provident fund, study fund, life-insurance savings, mortgage balance), the file classifier SHALL report the list of accounts, funds or policies that the file shows. For each one it SHALL report the product as printed on the file, the holder's name as printed or that no name is readable (absent or hidden), and the account or policy number as printed or that none is printed. The classifier SHALL report only what is printed on the file: it SHALL NOT take a holder's name, a number or a count from the file name, from the list of required documents or from a guess. A file of another document type, and a file where no account or policy can be told apart, SHALL report an empty list. The list SHALL hold at most 20 entries; when the file shows more, the analysis SHALL say that the list is partial.

The planner SHALL see, on the file's analysis line, how many accounts or policies the file shows and, for each, the product, the holder's name (or that it is hidden) and only the last 4 characters of the number (the full number stays in the stored analysis). These texts come from the file, so they SHALL be cleaned like every other text taken from a file before they enter the planner's input, and a quarantined file SHALL show none of them. The list SHALL NOT change any verdict of `validate_classification`, SHALL NOT tie a file to an item, and SHALL NOT be accepted as evidence for creating a list item. An analysis stored before this requirement existed has no list; it SHALL keep working and SHALL be shown to the planner without the list.

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

### Requirement: The agent asks the client about a file that belongs to no agreed item
When a received file is readable, is not quarantined, matches no document, and its content looks relevant to the declaration (an account, fund, policy, asset or liability of the client), the planner's instructions SHALL require the reply to mention the file, to state what was read from it — the company, the kind of document, how many accounts or policies it shows and whose name is on each — and to ask the client to confirm that this is correct and belongs in the declaration. The instructions SHALL forbid asking the client for a fact that the file's analysis already shows (for example "how many policies are there?" or "in whose name is each one?" when the analysis lists them). An open question SHALL be allowed only for a fact the analysis does not show, and the reply SHALL then say that this fact is missing from the file (for example that the holder's name is hidden) and ask only for it. When several such files arrived, the reply SHALL group them into one statement (by company and holder) and end with one confirmation request, instead of one question per file. The instructions SHALL forbid changing the list because of the file. The file SHALL stay unattached and SHALL keep appearing among the unmatched files of the documents tab until an item is created for it. The confirmation request counts toward the reply's limit of questions. A file that is plainly not a declaration document (for example a cover letter) SHALL NOT trigger the question.

The client's answer to such a confirmation request is the client's own words: a short confirmation ("כן, נכון") in a stored inbound message SHALL be valid evidence for the items the agent then creates, under the unchanged rule that an item is created only on the client's quoted words.

#### Scenario: Asking about the Harel file
- **WHEN** the planner cycle runs after the Harel certificate arrived with no text and matched no document
- **THEN** the reply mentions that a Harel study fund certificate was received, asks whether the client has a study fund in Harel that belongs in the declaration, no list item is created, and the file is attached to nothing

#### Scenario: Client says it is not theirs
- **WHEN** the client answers that the file was sent by mistake
- **THEN** no item is created, the file stays unattached, and the agent does not ask about it again

#### Scenario: Stating what was found instead of asking
- **WHEN** three insurance files from Harel, Clal and Migdal matched no document, and each analysis lists two policies, one in the name "תמיר ניב" and one in the name "מיכל ניב"
- **THEN** the reply says that it sees two policies in each of Harel, Clal and Migdal, one in the client's name and one in his wife's name, and asks whether this is correct and belongs in the declaration — and it does not ask how many policies there are or in whose name they are

#### Scenario: A fact the file does not show
- **WHEN** a Yelin Lapidot study fund file matched no document and its analysis lists two accounts with the holder hidden
- **THEN** the reply says that it sees two study fund accounts in Yelin Lapidot, that the holder's name is hidden in the file, and asks only whose accounts they are

#### Scenario: Many files in one turn
- **WHEN** eleven files of one turn matched no document
- **THEN** the reply holds one grouped statement of what was found and ends with one confirmation request, not eleven questions

#### Scenario: Short confirmation creates the items
- **WHEN** the client answers the confirmation request with "כן, הכול נכון" and the planner creates the Harel, Clal and Migdal items quoting these words with that message's id and naming the waiting files
- **THEN** the gate accepts the answer, the items are created, and the waiting files are attached and verified in that cycle

### Requirement: A waiting file is attached to the new item in the same cycle
When the planner creates an item with valid evidence, it SHALL be able to name received files that are this document. For each named file, code SHALL attach the file to the new item and mark the item received in the same cycle only when all of these hold: the file is a stored file of this client; it is not a split original; its analysis is complete, readable and not quarantined; it is not attached to another item; its analysed document type equals the new item's type; and the company comparison of this capability accepts the tie (the item's own evidence counts as the client's words when a company cannot be identified). A named file that fails any condition SHALL be ignored, and the item SHALL then be created as waiting. An item that received its file this way SHALL go through the same verification, withheld reply and single follow-up reply as any item collected in a cycle. At most one item SHALL receive a given file.

#### Scenario: Confirmation after the question
- **WHEN** the Harel file is waiting unattached, the client confirms "כן, זו קרן שלי", and the planner adds the Harel item naming that file
- **THEN** in that same cycle the file is attached to the new item, the item is marked received, the file is verified, and the one reply of the turn reports the verification result

#### Scenario: Named file of another type
- **WHEN** the planner creates a bank item and names a file whose analysed type is "study fund"
- **THEN** the item is created as waiting and the file stays unattached

#### Scenario: Named file is quarantined
- **WHEN** the named file was judged not legible
- **THEN** the item is created as waiting, the file stays unattached, and the reply asks for a clear copy as today

#### Scenario: Same file named for two items
- **WHEN** the planner names one file for two new items
- **THEN** the first item receives the file and the second is created as waiting
