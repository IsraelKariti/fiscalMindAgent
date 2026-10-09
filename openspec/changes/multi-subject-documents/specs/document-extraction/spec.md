## MODIFIED Requirements

### Requirement: Every document is read into the same common fields
For every checklist document that is verified automatically, the extraction call SHALL return the same common fields regardless of the document's type: whether the file is the expected document, what the document actually is, the issuer, the list of parties the document names (see the parties requirement below), the as-of date of the balances, the document's own valid-until date, the list of main amounts (label, value, currency), whether the file is legible, and whether the file carries text that tries to instruct an AI. The answer SHALL NOT carry a single subject name or a single subject id: a document's people are only ever reported as parties. A document type SHALL NOT remove or rename a common field.

#### Scenario: A type with no extra fields
- **WHEN** a prior-declaration document (a type that declares no extra fields) is verified
- **THEN** the extraction answer holds exactly the common fields, with the people of the document under `parties`

#### Scenario: Old verification records keep their shape
- **WHEN** an admin opens the `verify_extraction` step of a document verified before this change, whose stored answer carries `subject_name` and `subject_id_number`
- **THEN** the step opens and shows the stored checks as recorded; nothing is rewritten

## ADDED Requirements

### Requirement: The extraction lists every party of the document with its role
The extraction answer SHALL carry `parties`: a list of up to ten people the document names, one entry per person. Each entry SHALL carry the person's name exactly as printed beside that person, the person's national id as printed beside that person (digits only) or none when no id is printed for that person, and one role from a closed list: `owner` — the person who holds the asset or owes the liability the document proves (the buyer in a purchase contract, the account holder, the fund member, the insured, the borrower, the heir, the registered owner); `counterparty` — the other side of the document (the seller, the lending bank, the builder, the giver of a gift); `other` — anyone else named (witness, lawyer, guarantor, agent). The prompt SHALL instruct the model to keep each id next to the one name it is printed beside, never to join several names into one entry, never to put a counterparty's id on an owner, and to leave the id empty when the pairing is not readable. A business named as a party SHALL be listed with its name, no id and the role the document gives it. The list SHALL be empty when the document names nobody.

#### Scenario: Four-party purchase contract
- **WHEN** a purchase contract naming the sellers "מקמל קתי פנינה" and "מקמל חזי" with their ids and the buyers "תמיר מיכל" and "תמיר ניב" with their ids is verified
- **THEN** `parties` holds four entries, the two buyers with role `owner` and the two sellers with role `counterparty`, each with the id printed beside their own name

#### Scenario: Joint bank account
- **WHEN** a bank balance certificate for an account held by "תמיר ניב" and "תמיר מיכל", printing both ids, is verified
- **THEN** `parties` holds two entries, both with role `owner`, each with their own id

#### Scenario: One member, one id
- **WHEN** a pension report printing one member "תמיר מיכל" and her id is verified
- **THEN** `parties` holds one entry with role `owner`, her name and her id

#### Scenario: Names printed, ids not paired
- **WHEN** a contract prints the buyers' names on page one and a list of ids on the signature page that cannot be matched to a name
- **THEN** each owner entry carries the name and no id
