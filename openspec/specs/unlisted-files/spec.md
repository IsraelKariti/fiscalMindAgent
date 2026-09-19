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
For list items of a document type that is always issued by a financial institution (bank balance, securities portfolio, pension or provident fund, study fund, life-insurance savings, mortgage balance), the file classifier SHALL report the name of the company that issued the file as printed on it, and code SHALL compare companies before a file is tied to such an item. Code SHALL hold a table of known banks, investment houses and insurers, each with its Hebrew and English name forms, and SHALL identify the company of the file from the reported issuer and the company of the item from the item's name. `validate_classification` SHALL keep a match to such an item only when both companies are identified and are the same company; when the companies differ, or when either cannot be identified, the match SHALL be dropped and the file SHALL end as matching no document. The gate SHALL report this as the check `issuer_matches_item`, with the file's issuer as the observed value, the item's company as the expected value, and a note that says whether the companies differ or which side could not be identified; the check SHALL be absent when no item was matched or the matched item's type is not institution-bound. The planner SHALL see, in the file's analysis line, the reported issuer and, when a match was dropped by this check, that it was dropped and why.

The same comparison SHALL guard every tie the planner proposes between a file and an institution-bound item (a file paired with an existing item, and a file named for a new item): a tie between two identified, different companies SHALL always be refused; a tie where a company cannot be identified SHALL be accepted only when the proposal carries evidence — a stored inbound message of the client and a verbatim quote from it. Items of other document types are not affected by this requirement.

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
- **WHEN** the matched item is named "אישור יתרות בנק" with no bank name
- **THEN** the match is dropped and the note says the item's company could not be identified

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

### Requirement: A list item is created only on the client's quoted words
Every planner proposal that makes a list item needed — settling an open question as needed, or adding an item to a type that is already settled — SHALL carry evidence: the id of a stored inbound message of this client and a quote that appears verbatim in that message's text. The decision gate SHALL reject a proposal without evidence, with a message id that is not a stored inbound message of the client, or with a quote that is not found in that message, and the rejection SHALL be reported through the `business_rules` check of `validate_message`. Text from a received file, from a file name, from the online questionnaire or from the agent's own messages SHALL NOT be accepted as evidence. The accepted evidence SHALL be stored with the created items and shown in the step's detail. Items created by the office's own processing of the online questionnaire and items the accountant adds by hand are not planner proposals and are not affected.

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

### Requirement: The agent asks the client about a file that belongs to no agreed item
When a received file is readable, is not quarantined, matches no document, and its content looks relevant to the declaration (an account, fund, policy, asset or liability of the client), the planner's instructions SHALL require the reply to mention the file and ask the client whether it is theirs and belongs in the declaration, and SHALL forbid changing the list because of the file. The file SHALL stay unattached and SHALL keep appearing among the unmatched files of the documents tab until an item is created for it. The question counts toward the reply's limit of questions. A file that is plainly not a declaration document (for example a cover letter) SHALL NOT trigger the question.

#### Scenario: Asking about the Harel file
- **WHEN** the planner cycle runs after the Harel certificate arrived with no text and matched no document
- **THEN** the reply mentions that a Harel study fund certificate was received, asks whether the client has a study fund in Harel that belongs in the declaration, no list item is created, and the file is attached to nothing

#### Scenario: Client says it is not theirs
- **WHEN** the client answers that the file was sent by mistake
- **THEN** no item is created, the file stays unattached, and the agent does not ask about it again

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
