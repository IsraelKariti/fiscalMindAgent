## MODIFIED Requirements

### Requirement: The CRM card's id cell is recognised by title and value
When the kickoff (or a refresh of an existing client) reads the linked CRM card, it SHALL take the client's national id from a text cell whose column title names an id: Hebrew titles containing `מספר זהות`, `תעודת זהות`, `זהות`, or the abbreviation `ת"ז` in any punctuation form (`ת.ז`, `ת"ז`, `ת״ז`, `תז`), and English titles equal to or containing `id`, `id number`, `national id`, or `identity` as a word (a title such as `Email` or `item id` does not count). A title that also names the spouse (`בן זוג`, `בת זוג`, `בן/בת זוג`, `בן/בת הזוג`, `spouse`, `partner`) SHALL NOT count as the client's id cell; it belongs to the spouse (the `spouse-identity` capability). The cell's digits SHALL be at least five long. When more than one cell qualifies, the one whose digits pass the Israeli id checksum SHALL win; otherwise the first qualifying cell. The id SHALL be stored on the client (`agent_fields.id_number`) at enrollment and refreshed on every re-fired kickoff.

#### Scenario: English "id" title
- **WHEN** the CRM card has a text column titled "id" holding nine digits
- **THEN** the client is enrolled with that id on file

#### Scenario: Several candidate cells
- **WHEN** the CRM card has a column "מס' זהות" holding a value that fails the checksum and a column "ת.ז" holding one that passes it
- **THEN** the id on file is the value that passes the checksum

#### Scenario: Unrelated titles are ignored
- **WHEN** the CRM card's only columns with digits are "phone" and "Email"
- **THEN** no id is stored on the client

#### Scenario: Spouse id cell is not the client's
- **WHEN** the CRM card has a column "ת"ז" holding the client's id and a column "ת"ז בן/בת זוג" holding another checksum-valid id
- **THEN** the client's id on file is the value of the "ת"ז" cell, and the other value is recorded as the spouse's id

## ADDED Requirements

### Requirement: The kickoff records the spouse and the marital status
At enrollment and on every re-fired kickoff, the system SHALL read the spouse's name, the spouse's id and the marital status from the questionnaire item's cells first and the CRM card's cells second, by the recognition rule of the `spouse-identity` capability, and store them on the client next to the client's own id. A value found SHALL replace a value of lower trust (a document-inferred one); a value not found SHALL leave what is on file untouched. The kickoff's audit detail SHALL name the spouse (name and masked id) and the marital status when they were read.

#### Scenario: Questionnaire names the spouse
- **WHEN** the questionnaire item has a cell "שם בן/בת הזוג" = "מיכל תמיר" and a cell "סטטוס משפחתי" = "נשוי/אה"
- **THEN** the client is enrolled married with spouse "מיכל תמיר" (id unknown), and the kickoff audit detail names her

#### Scenario: CRM card holds the spouse id when the questionnaire has none
- **WHEN** the questionnaire item has no spouse cell and the CRM card has "ת"ז בן/בת זוג" = "12-345-6782"
- **THEN** the spouse id 123456782 is on file from the CRM card

#### Scenario: Refresh keeps an inferred spouse
- **WHEN** a client whose spouse was inferred from a document is re-kicked off with a questionnaire that carries no spouse cell
- **THEN** the inferred spouse stays on file unchanged
