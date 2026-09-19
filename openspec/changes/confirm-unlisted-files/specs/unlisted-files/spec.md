## Purpose

How the capital-declaration agent treats a received file that belongs to no item already agreed with the client: the file stays unattached, the agent asks the client about it, and a list item is created only on the client's own quoted words — after which the waiting file is attached to the new item and verified in the same turn.

## ADDED Requirements

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
When the planner creates an item with valid evidence, it SHALL be able to name received files that are this document. For each named file, code SHALL attach the file to the new item and mark the item received in the same cycle only when all of these hold: the file is a stored file of this client; it is not a split original; its analysis is complete, readable and not quarantined; it is not attached to another item; and its analysed document type equals the new item's type. A named file that fails any condition SHALL be ignored, and the item SHALL then be created as waiting. An item that received its file this way SHALL go through the same verification, withheld reply and single follow-up reply as any item collected in a cycle. At most one item SHALL receive a given file.

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
