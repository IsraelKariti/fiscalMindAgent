## MODIFIED Requirements

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
