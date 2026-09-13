## Purpose

How a declaration-of-capital client's identity is read from the monday boards at kickoff and on refresh: the linked CRM card supplies the phone, the name and the national id that later verification compares against.

## ADDED Requirements

### Requirement: The CRM card's id cell is recognised by title and value
When the kickoff (or a refresh of an existing client) reads the linked CRM card, it SHALL take the client's national id from a text cell whose column title names an id: Hebrew titles containing `מספר זהות`, `תעודת זהות`, `זהות`, or the abbreviation `ת"ז` in any punctuation form (`ת.ז`, `ת"ז`, `ת״ז`, `תז`), and English titles equal to or containing `id`, `id number`, `national id`, or `identity` as a word (a title such as `Email` or `item id` does not count). The cell's digits SHALL be at least five long. When more than one cell qualifies, the one whose digits pass the Israeli id checksum SHALL win; otherwise the first qualifying cell. The id SHALL be stored on the client (`agent_fields.id_number`) at enrollment and refreshed on every re-fired kickoff.

#### Scenario: English "id" title
- **WHEN** the CRM card has a text column titled "id" holding nine digits
- **THEN** the client is enrolled with that id on file

#### Scenario: Several candidate cells
- **WHEN** the CRM card has a column "מס' זהות" holding a value that fails the checksum and a column "ת.ז" holding one that passes it
- **THEN** the id on file is the value that passes the checksum

#### Scenario: Unrelated titles are ignored
- **WHEN** the CRM card's only columns with digits are "phone" and "Email"
- **THEN** no id is stored on the client

### Requirement: Verification fetches a missing id from the CRM card
When a document is verified and the client has no id on file from either tax-portal credentials or `agent_fields.id_number`, but carries a linked CRM card (`agent_fields.monday_crm_item_id`) and the accountant's monday connection is available, the verification SHALL fetch the card, apply the recognition rule above, store the id on the client when found, and use it for that verification. A failed or empty fetch SHALL NOT fail the verification; the verification then proceeds as if no id were on file.

#### Scenario: Client enrolled before the broader recognition
- **WHEN** a client enrolled earlier has no id on file, its CRM card holds the id under "id", and a document printing that id is verified
- **THEN** the verification stores the id on the client and reports `id_matches_client` as passed

#### Scenario: monday unavailable
- **WHEN** the accountant's monday connection is missing or the card cannot be fetched
- **THEN** the verification runs without an id on file, and no error is raised to the client
