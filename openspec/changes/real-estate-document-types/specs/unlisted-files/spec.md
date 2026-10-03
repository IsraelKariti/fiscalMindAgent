## MODIFIED Requirements

### Requirement: The file check matches a file only to items agreed with the client
The file classifier SHALL be offered as match candidates only the list items a file can satisfy: items that were agreed with the client as needed, in any state of collection (waiting, claimed, received, approved). Items that are still an open question, items settled as not needed, and items that were replaced SHALL NOT be offered, and a match to one of them SHALL be dropped by `validate_classification` like any id the classifier was not shown. The classifier SHALL still name the file's document type from the closed list of types, and the file's paper from the closed list of papers (the `document-papers` capability), whether or not any item was matched. The classifier's instructions SHALL state that an item names a specific institution, account or asset, and that a file of another bank, fund, insurer, company or asset is not a match for it, even when the document type is the same; and that an item of a type with papers stands for one paper, and a file of another paper of the same asset is not a match for it.

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

#### Scenario: Another paper of the same property
- **WHEN** the list holds the items "חוזה רכישה — דינוביץ 47" and "נספח תשלומים — דינוביץ 47" and the client sends a land registry extract of that property
- **THEN** the file's analysis names the type `real_estate` and the paper `tabu_extract`, and says it matches no document

## ADDED Requirements

### Requirement: A tie is refused when the papers differ
Every tie the planner proposes between a file and an item that carries a paper SHALL be refused when the file's paper differs from the item's paper or the file carries no paper, as the `document-papers` capability defines, in the same way a tie is refused when the document types differ. The refusal SHALL be reported in the `apply_collections` step, the file SHALL stay unattached, and the item SHALL NOT be marked received because of it. A tie to an item that carries no paper is not affected.

#### Scenario: Planner ties the registry extract to the contract item
- **WHEN** the planner pairs a file whose paper is `tabu_extract` with the item "חוזה רכישה — דינוביץ 47" (paper `purchase_contract`)
- **THEN** the pair is refused and reported in `apply_collections`, and the file stays unattached

#### Scenario: Planner names a file for a new item of its paper
- **WHEN** the client writes that the registry extract is for a flat they inherited, and the planner adds the item "נסח טאבו — …" with paper `tabu_extract`, naming the file for it
- **THEN** the file is attached to the new item in the same cycle, as the waiting-file rule says
