## ADDED Requirements

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

## MODIFIED Requirements

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
