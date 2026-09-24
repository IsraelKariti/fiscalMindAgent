# spouse-identity Specification

## Purpose

The one spouse a declaration-of-capital client may have: what the client record keeps about them, where that knowledge may come from (the submitted questionnaire, the CRM card, verified documents), how document verification accepts the spouse's documents while rejecting a third person's, and what the agent and the workspace are told.

## Requirements

### Requirement: A client has at most one spouse on file
The client record SHALL hold at most one spouse: a name and a national id, each of which MAY be unknown, and for each the source it came from (questionnaire, CRM card, or document). The record SHALL also hold the client's marital status when it is known: married, not married, or unknown. There SHALL be no way to store a second spouse; a later value from a source of higher trust replaces the earlier one, a later value from a source of equal or lower trust is ignored. The spouse's national id SHALL be stored in full but SHALL never be shown in full to the agent, the trace or the workspace: only its last three digits, masked like the client's id.

#### Scenario: Record after the questionnaire and one document
- **WHEN** the questionnaire named the spouse "מיכל תמיר" and a verified document later printed her id
- **THEN** the client record holds one spouse with the name from the questionnaire and the id from the document, and the marital status is married

#### Scenario: No second spouse
- **WHEN** a spouse id is already on file and a verified document prints a different checksum-valid id
- **THEN** the record keeps the spouse it has; the document is rejected (see the identity requirement below)

### Requirement: The questionnaire and the CRM card supply the spouse and the marital status
At kickoff, and again on every re-fired kickoff, the system SHALL read the spouse and the marital status from the cells of the submitted questionnaire item first and the linked CRM card second. A cell whose column title names the spouse (Hebrew `בן זוג`, `בת זוג`, `בן/בת זוג`, `בן/בת הזוג`, `בן או בת זוג`; English `spouse`, `partner` as words) SHALL be read as the spouse's id when the title also names an id (the same id titles the client-id rule recognises) and the cell holds at least five digits; it SHALL be read as the spouse's name when the title names no id and the cell holds at least two letters. When more than one id cell qualifies, the one that passes the Israeli id checksum wins, otherwise the first. A cell whose title names the marital status (`סטטוס משפחתי`, `מצב משפחתי`, `marital status`) SHALL set the status: a value containing `נשוי`, `נשואה` or `married` means married; a value containing `רווק`, `רווקה`, `גרוש`, `גרושה`, `אלמן`, `אלמנה`, `פרוד`, `פרודה`, `single`, `divorced`, `widow` or `separated` means not married; any other value leaves the status unknown. A questionnaire or CRM value SHALL replace a document-inferred value; the absence of a questionnaire or CRM value SHALL leave a document-inferred value in place. A spouse read from the questionnaire or the CRM card at kickoff SHALL be recorded in the kickoff's audit detail with the name and the masked id.

#### Scenario: Married with the spouse's name and id on the form
- **WHEN** the questionnaire item has "סטטוס משפחתי" = "נשוי/אה", "שם בן/בת הזוג" = "מיכל תמיר" and "ת"ז בן/בת הזוג" = "12-345-6782"
- **THEN** the client is enrolled married, with spouse "מיכל תמיר", id 123456782 from the questionnaire

#### Scenario: Married with no spouse cells
- **WHEN** the questionnaire item has "סטטוס משפחתי" = "נשוי/אה" and no spouse-titled cell, and the CRM card has none either
- **THEN** the client is enrolled married with no spouse on file, and the spouse may later be inferred from a document

#### Scenario: Re-fired kickoff after a document-inferred spouse
- **WHEN** a spouse id was inferred from a document and the kickoff is re-fired for a questionnaire that carries no spouse id
- **THEN** the inferred id stays on file

#### Scenario: Questionnaire id replaces an inferred one
- **WHEN** a spouse id was inferred from a document and the kickoff is re-fired for a questionnaire whose spouse id cell holds a different checksum-valid id
- **THEN** the questionnaire id replaces the inferred one and the replacement is audited with both masked ids

### Requirement: Verification accepts the client or the spouse and rejects anyone else
When a verified document prints a national id, the identity check SHALL pass when the printed id equals the client's id on file or the spouse's id on file, and the check's expected value SHALL name which of the two it matched. When the printed id equals neither and the client's id is on file, the system SHALL infer the spouse from the document only if all of the following hold: no spouse id is on file yet, the printed id passes the Israeli id checksum, the marital status on file is not "not married", and — when a spouse name is on file — the printed subject name loosely matches that spouse name. When the spouse is inferred, the printed id (and the printed name, when no spouse name is on file) SHALL be stored on the client before the next document is verified, an audit event SHALL record the adoption with the masked id, the document and the file, and the verification SHALL report an extra passed check that says the spouse was adopted from this document. When inference is not allowed, the identity check SHALL fail with a note that says which condition failed: the document belongs to a third person (a spouse is already on file), the client is registered as not married, or the printed name does not match the spouse on file. When no client id is on file, a printed id equal to the spouse's id on file SHALL count as the spouse; any other printed id SHALL be handled as today (reported, not compared) and no spouse SHALL be inferred.

#### Scenario: Spouse pension with the spouse's id from the questionnaire
- **WHEN** the spouse's id ••••••782 is on file from the questionnaire and a pension report printing "מיכל תמיר" and id 123456782 is verified for client "ניב"
- **THEN** the identity check passes with expected "spouse ••••••782 (questionnaire)", the subject check passes, and the document is approved when its other checks pass

#### Scenario: First foreign id becomes the spouse
- **WHEN** the client's id is on file, no spouse id is on file, the marital status is married or unknown, and a document printing "מיכל תמיר" with a checksum-valid id that is not the client's is verified
- **THEN** the identity check passes, the extra "spouse adopted" check is reported with the masked id, the client record now holds spouse "מיכל תמיר" with that id from the document, and an audit event records the adoption

#### Scenario: Second document of the same spouse in the same batch
- **WHEN** two of the spouse's documents are collected in one turn and the first one infers the spouse
- **THEN** the second one is verified against the spouse just stored and passes the identity check without a second adoption

#### Scenario: A third person's document
- **WHEN** the client's id and a spouse id are on file and a document prints a checksum-valid id that equals neither
- **THEN** the identity check fails with a note that the document belongs to neither the client nor the spouse on file, the verification result is a failure, and the record is unchanged

#### Scenario: Client registered as not married
- **WHEN** the questionnaire set the marital status to not married and a document prints an id that is not the client's
- **THEN** the identity check fails with a note that the client is registered as not married, and no spouse is inferred

#### Scenario: Printed name contradicts the spouse's name from the form
- **WHEN** the questionnaire named the spouse "מיכל תמיר", no spouse id is on file, and a document prints "דנה לוי" with a checksum-valid id that is not the client's
- **THEN** the identity check fails with a note that the printed name does not match the spouse on file, and no spouse is inferred

#### Scenario: Printed id fails the checksum
- **WHEN** no spouse id is on file and a document prints an id that is not the client's and fails the checksum
- **THEN** the id checksum check fails as today and no spouse is inferred

#### Scenario: Client id not on file
- **WHEN** the client has no id on file, the spouse's id is on file from the questionnaire, and a document prints that spouse id
- **THEN** the identity check passes as the spouse, and the "no client id on file" report is absent

### Requirement: A name-only document may be the spouse's
When a verified document prints no id, the subject check SHALL pass when the printed subject name loosely matches the client's name or the spouse's name on file, and SHALL fail otherwise. A spouse SHALL NOT be inferred from a name alone.

#### Scenario: Spouse's name on file, no id printed
- **WHEN** the spouse "מיכל תמיר" is on file and a bank confirmation printing "מיכל תמיר" and no id is verified for client "ניב"
- **THEN** the subject check passes with expected the spouse's name

#### Scenario: Unknown name, no id printed
- **WHEN** no spouse is on file and a document printing "דנה לוי" and no id is verified for client "ניב"
- **THEN** the subject check fails as today and no spouse is recorded

### Requirement: The planner is told about the household
Every planning prompt SHALL carry a fenced `CLIENT IDENTITY` block that states: the client's name; whether a national id is on file for the client (yes/no, never the number); the marital status (married / not married / unknown, with "questionnaire" as its source when known); and the spouse on file — the name, or "name unknown", and whether an id is known and from where (questionnaire, CRM card, document), or "none on file". The prompt instructions SHALL tell the agent that the spouse's assets and liabilities belong to the declaration; that a list instance owned by the spouse carries the spouse's name in its name (for example "קרן פנסיה של מיכל במנורה"); that when two instances of one type and one company exist for the two spouses, a file is tied to the instance whose owner matches the holder printed on the file; and that the agent never asks the client for a national id number in the conversation.

#### Scenario: Married client with an inferred spouse
- **WHEN** a client is married per the questionnaire and the spouse "מיכל תמיר" was inferred from a document
- **THEN** the block reads that the client is married (questionnaire), the spouse on file is "מיכל תמיר", id known (document), and the client's id is on file

#### Scenario: Nothing known
- **WHEN** a client has no marital status and no spouse on file
- **THEN** the block reads marital status unknown and spouse none on file

### Requirement: The workspace shows the spouse on file
The capital documents card SHALL show one line with the marital status and the spouse on file: the name (or "name unknown"), the masked id when known, and the source of each. When the marital status is unknown and no spouse is on file, the line SHALL be absent.

#### Scenario: Spouse adopted from a document
- **WHEN** the accountant opens the documents tab of a client whose spouse "מיכל תמיר" (id ••••••782) was inferred from a document
- **THEN** the card shows the line with the name, the masked id and "document" as the source

#### Scenario: Nothing on file
- **WHEN** the client has no marital status and no spouse on file
- **THEN** no spouse line is shown
