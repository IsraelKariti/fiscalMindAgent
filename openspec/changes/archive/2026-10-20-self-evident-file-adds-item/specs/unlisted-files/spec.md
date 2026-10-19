## ADDED Requirements

### Requirement: A file in the client's name proves its own list item
A received file SHALL count as self-evident when code can verify all of the following from the stored analysis and the client's record, without any model judgement at decision time: the file's document type is institution-bound (bank balance, securities portfolio, pension or provident fund, study fund, life-insurance savings, mortgage balance); the analysis is complete, readable and not quarantined, and the file is not a split original; the file is attached to no item and matches no document; the classifier's confidence is high; the issuing company printed on the file is recognised as exactly one company of the institutions table; the file lists at least one account, fund or policy; and every listed holder name is printed (none hidden) and names the client or the spouse on file by first and last name (sharing at least two name tokens with that person's name on file, in any order; a surname alone is not enough). When a holder is close to both, the closer name wins and the client wins a tie. A file where any of these fails SHALL NOT count as self-evident and SHALL be handled as an unmatched file under the existing requirements (the agent states what it found and asks the client).

The planner's analysis line of a self-evident file SHALL say so, in words that name the matched person ("in the client's name" / "in the spouse's name") and that the file may be added without asking. A file that is not self-evident SHALL carry no such marker. The marker is code's own text, never file text.

#### Scenario: Study fund report in the client's name
- **WHEN** the client "שי מלמוד" sends a Phoenix study fund annual report that lists one account, holder "מלמוד שי", employer "אלעד מערכות תוכנה", confidence high, and the study fund row was settled as not needed from the questionnaire
- **THEN** the file counts as self-evident and its analysis line says it is in the client's name and may be added without asking

#### Scenario: Holder hidden
- **WHEN** a Yelin Lapidot study fund report lists two accounts whose holder is blacked out
- **THEN** the file is not self-evident, its line carries no marker, and the agent asks whose accounts they are as today

#### Scenario: Holder is a third person
- **WHEN** a Clal report lists one policy in the name "דנה כהן", and neither the client nor the spouse on file is named Cohen
- **THEN** the file is not self-evident and the agent asks about it as today

#### Scenario: Same surname only
- **WHEN** the client is "ישראל ישראלי", no spouse is on file, and a Harel report lists one policy in the name "רונית ישראלי"
- **THEN** the file is not self-evident (a surname alone does not name the client) and the agent asks about it as today

#### Scenario: Spouse on file
- **WHEN** the spouse on file is "מיכל ניב" and a Harel pension report lists one fund in the name "ניב מיכל"
- **THEN** the file counts as self-evident in the spouse's name

#### Scenario: Company not recognised
- **WHEN** a study fund report of a small fund that the institutions table does not hold is in the client's name
- **THEN** the file is not self-evident and the agent asks about it as today

#### Scenario: Type that is not institution-bound
- **WHEN** the client sends a vehicle licence in his name for a vehicle not on the list
- **THEN** the file is not self-evident and the agent asks about it as today

#### Scenario: Confidence not high
- **WHEN** the classifier read a bank balance in the client's name with medium confidence
- **THEN** the file is not self-evident

### Requirement: A self-evident file creates its item without a client quote
A planner proposal that settles the catalog row of the file's type as needed, or that adds an item under an already-settled row of that type, MAY cite a self-evident file instead of a client quote. The decision gate SHALL accept the citation only when the cited file is in the code-built pool of self-evident files of this client and its document type equals the type of the row being settled or anchored; it SHALL reject, through the `business_rules` check of `validate_message`, a citation of a file outside the pool, of another type, or that is given together with a quote-less proposal of any other kind. A quote, when given, SHALL win over the citation. One cited file SHALL create at most one item; a proposal that names several instances on one cited file SHALL be rejected.

Code SHALL build the created item's name: the planner's name, with the Hebrew table name of the file's company appended when the name does not already contain it and, for an employer-bound type with a printed employer, the cleaned employer appended when the name does not already contain it — the same pattern the per-company split uses. The model's free text about the file SHALL NOT be used for the name.

The cited file SHALL be attached to the new item in the same cycle and the item marked received, under the conditions of requirement "A waiting file is attached to the new item in the same cycle", whether or not the planner also listed the file among the item's files. The item SHALL then go through the same verification, withheld reply and single follow-up reply as any item collected in a cycle. A cycle whose only list change is such an item SHALL be a `collect` decision with no message.

The evidence stored on the created item SHALL name the file, the issuer as printed, the matched holder names and the matched person (client or spouse), and the cleaned employer when one was printed. The documents tab SHALL show that the item was created from a file in the client's name, and the audit trail SHALL record the creation with this evidence. A row settled as needed this way SHALL carry the same evidence.

#### Scenario: Phoenix study fund added without a question
- **WHEN** the planner cycle runs after the Phoenix report of the first scenario arrived with no text, and the planner settles the study fund row as needed citing that file with one instance "אישור יתרת קרן השתלמות ליום 31.12.2025 — הפניקס"
- **THEN** the gate accepts the answer, the item is created with the name "אישור יתרת קרן השתלמות ליום 31.12.2025 — הפניקס — אלעד מערכות תוכנה", the file is attached and the item marked received in that cycle, no question is sent, and the follow-up reply reports the verification result

#### Scenario: Added under a settled row
- **WHEN** the list already holds the approved item "קרן השתלמות — אלטשולר שחם" and a self-evident Harel study fund report arrives
- **THEN** the planner adds a Harel item citing the file, the gate accepts it, and the file is attached and verified in that cycle

#### Scenario: Cited file is not self-evident
- **WHEN** the planner cites, instead of a quote, a file whose holder is hidden
- **THEN** the gate rejects the answer with a note that the file does not prove the item, and the retry text tells the planner to ask the client

#### Scenario: Cited file of another type
- **WHEN** the planner settles the pension row as needed citing a self-evident study fund file
- **THEN** the gate rejects the answer

#### Scenario: Two instances on one file
- **WHEN** the planner settles the study fund row as needed with two instances citing one self-evident file
- **THEN** the gate rejects the answer

#### Scenario: Name without the company
- **WHEN** the planner names the new item "קרן השתלמות" for a self-evident Phoenix file with no printed employer
- **THEN** the item is created as "קרן השתלמות — הפניקס"

#### Scenario: Verification fails afterwards
- **WHEN** the item was created from a self-evident file and the extraction check later rejects the file (for example the balance date is wrong)
- **THEN** the item stays on the list as waiting with the rejection reasons, and the follow-up reply asks for a corrected document as for any rejected file

#### Scenario: Documents tab and audit
- **WHEN** an accountant opens the documents tab after the Phoenix item was created
- **THEN** the item shows that it was created from a file in the client's name, naming the issuer, and the audit trail holds the creation with the file id, issuer, matched holder and employer

## MODIFIED Requirements

### Requirement: A list item is created only on the client's quoted words
Every planner proposal that makes a list item needed — settling an open question as needed, or adding an item to a type that is already settled — SHALL carry evidence: the id of a stored inbound message of this client and a quote that appears verbatim in that message's text. The decision gate SHALL reject a proposal without evidence, with a message id that is not a stored inbound message of the client, or with a quote that is not found in that message, and the rejection SHALL be reported through the `business_rules` check of `validate_message`. Text from a received file, from a file name, from the online questionnaire or from the agent's own messages SHALL NOT be accepted as evidence. The accepted evidence SHALL be stored with the created items and shown in the step's detail. Items created by the office's own processing of the online questionnaire and items the accountant adds by hand are not planner proposals and are not affected. Two exceptions exist, both decided by code: the per-company and per-employer split of an item (requirement "An item that names no company is split per company when files are tied to it"), which divides an item the client already agreed to and carries the creating file as its evidence; and a self-evident file in the client's or spouse's name (requirement "A self-evident file creates its item without a client quote"), which the planner cites instead of a quote and which the gate accepts only from the code-built pool.

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

### Requirement: The agent asks the client about a file that belongs to no agreed item
When a received file is readable, is not quarantined, matches no document, is not self-evident (requirement "A file in the client's name proves its own list item"), and its content looks relevant to the declaration (an account, fund, policy, asset or liability of the client), the planner's instructions SHALL require the reply to mention the file, to state what was read from it — the company, the kind of document, how many accounts or policies it shows and whose name is on each — and to ask the client to confirm that this is correct and belongs in the declaration. The instructions SHALL forbid asking the client for a fact that the file's analysis already shows (for example "how many policies are there?" or "in whose name is each one?" when the analysis lists them). An open question SHALL be allowed only for a fact the analysis does not show, and the reply SHALL then say that this fact is missing from the file (for example that the holder's name is hidden) and ask only for it. When several such files arrived, the reply SHALL group them into one statement (by company and holder) and end with one confirmation request, instead of one question per file. The instructions SHALL forbid changing the list because of a file that is not self-evident. The file SHALL stay unattached and SHALL keep appearing among the unmatched files of the documents tab until an item is created for it. The confirmation request counts toward the reply's limit of questions. A file that is plainly not a declaration document (for example a cover letter) SHALL NOT trigger the question.

For a self-evident file the instructions SHALL require the opposite: the planner adds the item citing the file, sends no question about it, and the cycle is a `collect` decision; when self-evident and other unmatched files arrive in one turn, the self-evident ones are added in that cycle and the question about the others is written in the follow-up reply after verification.

The client's answer to such a confirmation request is the client's own words: a short confirmation ("כן, נכון") in a stored inbound message SHALL be valid evidence for the items the agent then creates, under the unchanged rule that an item is created only on the client's quoted words.

#### Scenario: Asking about the Harel file
- **WHEN** the planner cycle runs after a Harel certificate whose holder name is hidden arrived with no text and matched no document
- **THEN** the reply mentions that a Harel study fund certificate was received, says the holder's name is hidden, asks whose fund it is, no list item is created, and the file is attached to nothing

#### Scenario: Client says it is not theirs
- **WHEN** the client answers that the file was sent by mistake
- **THEN** no item is created, the file stays unattached, and the agent does not ask about it again

#### Scenario: Stating what was found instead of asking
- **WHEN** three insurance files from Harel, Clal and Migdal matched no document, and each analysis lists two policies, one in the name "תמיר ניב" and one in the name "דנה כהן", a person not on file
- **THEN** the reply says that it sees two policies in each of Harel, Clal and Migdal, one in the client's name and one in the name דנה כהן, and asks whether this is correct and belongs in the declaration — and it does not ask how many policies there are or in whose name they are

#### Scenario: A fact the file does not show
- **WHEN** a Yelin Lapidot study fund file matched no document and its analysis lists two accounts with the holder hidden
- **THEN** the reply says that it sees two study fund accounts in Yelin Lapidot, that the holder's name is hidden in the file, and asks only whose accounts they are

#### Scenario: Many files in one turn
- **WHEN** eleven files of one turn matched no document and none is self-evident
- **THEN** the reply holds one grouped statement of what was found and ends with one confirmation request, not eleven questions

#### Scenario: Short confirmation creates the items
- **WHEN** the client answers the confirmation request with "כן, הכול נכון" and the planner creates the Harel, Clal and Migdal items quoting these words with that message's id and naming the waiting files
- **THEN** the gate accepts the answer, the items are created, and the waiting files are attached and verified in that cycle

#### Scenario: Self-evident and unclear files in one turn
- **WHEN** one turn carried a Phoenix study fund report in the client's name and a Yelin Lapidot report with the holder hidden
- **THEN** the cycle adds the Phoenix item citing its file and collects it with no message, and the follow-up reply after verification reports the Phoenix result and asks whose the Yelin Lapidot accounts are

### Requirement: A waiting file is attached to the new item in the same cycle
When the planner creates an item with valid evidence, it SHALL be able to name received files that are this document; an item created on a self-evident file SHALL count that file as named. For each named file, code SHALL attach the file to the new item and mark the item received in the same cycle only when all of these hold: the file is a stored file of this client; it is not a split original; its analysis is complete, readable and not quarantined; it is not attached to another item; its analysed document type equals the new item's type; and the company comparison of this capability accepts the tie (the item's own evidence counts as the client's words when a company cannot be identified). A named file that fails any condition SHALL be ignored, and the item SHALL then be created as waiting. An item that received its file this way SHALL go through the same verification, withheld reply and single follow-up reply as any item collected in a cycle. At most one item SHALL receive a given file.

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

#### Scenario: Self-evident file not listed among the item's files
- **WHEN** the planner settles the study fund row citing the Phoenix file but leaves the instance's file list empty
- **THEN** the file is still attached to the new item in that cycle and the item is marked received
