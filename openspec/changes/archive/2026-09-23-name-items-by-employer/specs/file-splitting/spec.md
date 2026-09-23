## MODIFIED Requirements

### Requirement: A child file that matches a list document is named after that document
When the classifier matches a child file to a document on the client's list and `validate_classification` accepts the match, the child SHALL get a display name equal to the name of the matched document — except when the matched document is of an institution-bound type and names no company the institutions table knows, and the company printed on the child is recognised as exactly one company of that table: then the display name SHALL be the matched document's name, followed by " — " and the company's Hebrew name from the institutions table. When the matched document names no company and the child's company is not recognised, the display name SHALL be the matched document's name alone. When the matched document is of an employer-bound type (study fund, pension or provident fund), the child reports a cleaned employer (openspec `unlisted-files`, requirement "The file check reports the accounts and policies a file shows"), and the name built so far does not already contain that employer text, the display name SHALL further be followed by " — " and the cleaned employer.

When a child file has no accepted match, is not quarantined, and the classifier put it in one of the known document types (not the catch-all "other" type), the child SHALL get a display name built from the platform's short name of that document type, followed by " — " and the company's name from the institutions table when the company printed on the file is recognised as exactly one company of that table, and, for an employer-bound type, followed by " — " and the cleaned employer when the child reports one. When the company is not recognised, or the text names two different companies, the company part SHALL be left out; when no employer is reported, the employer part SHALL be left out. The short type name SHALL NOT state a date or a year.

A display name SHALL be taken from the client's document list, the platform's list of document types, the institutions table and the cleaned employer only; every other text the model wrote about the file (its description, its summary, the company name as the model wrote it) and every other text from the file itself SHALL NOT be used as a name. The cleaned employer is the one word a name may carry from the file: it SHALL be cleaned as that requirement says (invisible and control characters removed, whitespace collapsed, the name separator replaced, at most 60 characters, at least one letter) before it enters a name. A quarantined child (not legible or suspected injection), a child whose analysis failed, and an unmatched child of the catch-all "other" type SHALL have no display name and SHALL be shown by its page-range file name as before. When the classifier runs again on the same child, the display name SHALL follow the new verdict. When the planner links a child to a list document, the display name SHALL become the name of the linked document, also when the child carried a type-based name before; when that linking splits or renames the document by company or by employer (openspec `unlisted-files`), the display name SHALL be the name of the document the child ends under, which then names the company and, when the child reported one, the employer.

The display name SHALL be what the documents list and the file viewer show as the file's name, and the original file's name and the child's page range SHALL stay visible next to it, so two children with the same display name can still be told apart. The stored file name of the child, the file name the planner sees, and the child's identity for idempotent creation SHALL NOT change. A file that was never split SHALL NOT get a display name from this rule. A display name SHALL NOT count as a match: it SHALL NOT link the child to a list document, SHALL NOT collect a document and SHALL NOT change what the planner is told about the file.

#### Scenario: Two children match two list documents
- **WHEN** "scan.pdf" is split into pages 1-2 and pages 3-4, the first child is matched to the list document "אישור יתרות - בנק לאומי" and the second to "צילום תעודת זהות", and the gate accepts both matches
- **THEN** the documents list shows the first child as "אישור יתרות - בנק לאומי" and the second as "צילום תעודת זהות", each with a line that says it is pages 1-2 / 3-4 of "scan.pdf"

#### Scenario: Unmatched child with a recognised company
- **WHEN** a child of "scan.pdf" covering pages 20-21 matches no document on the list, the classifier typed it as a study fund, the company printed on it is recognised as Harel, and no employer is printed
- **THEN** the child's display name is "קרן השתלמות — הראל", and the line next to it still says it is pages 20-21 of "scan.pdf"

#### Scenario: Unmatched child with a recognised company and an employer
- **WHEN** a child matches no document on the list, the classifier typed it as a study fund, the company printed on it is recognised as Meitav, and the employer printed on it is "פרייסמנס בע"מ"
- **THEN** the child's display name is "קרן השתלמות — מיטב — פרייסמנס בע"מ"

#### Scenario: Unmatched child with no recognised company
- **WHEN** a child matches no document on the list, the classifier typed it as a study fund, and the company printed on it is not in the institutions table
- **THEN** the child's display name is "קרן השתלמות"

#### Scenario: Unmatched child with an employer but no recognised company
- **WHEN** a child matches no document on the list, the classifier typed it as a study fund, the company printed on it is not in the institutions table, and the employer printed on it is "אלביט מערכות בע"מ"
- **THEN** the child's display name is "קרן השתלמות — אלביט מערכות בע"מ"

#### Scenario: A child matches nothing
- **WHEN** a child of "scan.pdf" covering pages 5-6 matches no document on the list and the classifier typed it as "other"
- **THEN** the child has no display name and is shown as "scan-p5-6.pdf" as before

#### Scenario: The gate drops the match
- **WHEN** the classifier proposes a match for a child it typed as life insurance savings from a recognised company, and `validate_classification` drops the match because the list item names a different company
- **THEN** the child is not linked to the list item, and its display name is the type-based name (the short name of life insurance savings and the company's name), not the list item's name

#### Scenario: The list item names no company
- **WHEN** the classifier matches a child it typed as life insurance savings from Harel to the list item "אישור להצהרת הון — ביטוח מנהלים / פוליסת חיסכון ליום 31.12.2025 — ניב", which names no company, and `validate_classification` keeps the match
- **THEN** the child is linked to the list item and its display name is "אישור להצהרת הון — ביטוח מנהלים / פוליסת חיסכון ליום 31.12.2025 — ניב — הראל"

#### Scenario: Three children of three companies match one item that names no company
- **WHEN** three children of one PDF, from Harel, Clal and Migdal, all match the list item "ביטוח מנהלים ניב", which names no company
- **THEN** the children are shown as "ביטוח מנהלים ניב — הראל", "ביטוח מנהלים ניב — כלל" and "ביטוח מנהלים ניב — מגדל"

#### Scenario: Three children of one company and three employers match one item
- **WHEN** three Meitav study fund children of one PDF, whose employers are "פרייסמנס בע"מ", "גילת רשתות לווין בע"מ" and "ראנדקום בע"מ", all match the list item "אישור יתרת קרן השתלמות ליום 31.12.2025 — ניב — מיטב"
- **THEN** the children are shown as "אישור יתרת קרן השתלמות ליום 31.12.2025 — ניב — מיטב — פרייסמנס בע"מ", "… — מיטב — גילת רשתות לווין בע"מ" and "… — מיטב — ראנדקום בע"מ", and each downloads under a file name built from its own display name

#### Scenario: The list item already names the employer
- **WHEN** the classifier matches a Meitav child whose employer is "פרייסמנס בע"מ" to the list item "אישור יתרת קרן השתלמות ליום 31.12.2025 — ניב — מיטב — פרייסמנס בע"מ"
- **THEN** the child's display name is that item's name, with the employer once

#### Scenario: Employer on a type that is not employer-bound
- **WHEN** the classifier matches a Clal executive-insurance child that prints an employer to the list item "ביטוח מנהלים ניב"
- **THEN** the child's display name is "ביטוח מנהלים ניב — כלל", without the employer

#### Scenario: The list item names no company and the child's company is not recognised
- **WHEN** the classifier matches a child to the list item "ביטוח מנהלים ניב" and `validate_classification` keeps the match on the client's evidence although the company printed on the child is not in the institutions table
- **THEN** the child's display name is "ביטוח מנהלים ניב"

#### Scenario: Two children of the same type and company
- **WHEN** two unmatched children of "scan.pdf", pages 34-35 and pages 36-37, are both study fund reports of the same recognised company and print the same employer, or both print none
- **THEN** both get the same display name, and each is told apart by its page range shown next to the name

#### Scenario: Model text is not used
- **WHEN** the classifier describes an unmatched child as "דוח שנתי ואישור מס להצהרת הון - קרן השתלמות" and writes the company as "הראל פנסיה וגמל בע"מ"
- **THEN** the display name is "קרן השתלמות — הראל", built from the platform's type name and the institutions table, and contains neither of the model's two texts

#### Scenario: Employer text that fails cleaning
- **WHEN** the classifier reports, for a study fund child, an employer of 80 characters that ends in instruction-like text
- **THEN** the employer is dropped by the cleaning and the display name carries no employer part

#### Scenario: Quarantined child
- **WHEN** the classifier judges a child not legible while also proposing a match or a type
- **THEN** the child is quarantined as today and gets no display name

#### Scenario: Planner links the child to another document
- **WHEN** a child named "אישור יתרות - בנק לאומי" by the classifier is linked by the planner to the list document "אישור יתרות - בנק דיסקונט"
- **THEN** the child's display name becomes "אישור יתרות - בנק דיסקונט"

#### Scenario: Planner links a child that had a type-based name
- **WHEN** a child named "קרן השתלמות — הראל" is later linked by the planner to the list document "אישור יתרת קרן השתלמות ליום 31.12.2025 — הראל"
- **THEN** the child's display name becomes the name of that list document

#### Scenario: Planner ties the child to an item that is then split by company
- **WHEN** a Clal child named "ביטוח מנהלים ניב — כלל" by the classifier is tied by the planner to the item "ביטוח מנהלים ניב", and the tie creates the item "ביטוח מנהלים ניב — כלל" for it
- **THEN** the child's display name is "ביטוח מנהלים ניב — כלל", the name of the item it ends under

#### Scenario: Planner ties the child to an item that is then split by employer
- **WHEN** a Meitav child whose employer is "ראנדקום בע"מ" is tied by the planner to the item "קרן השתלמות ניב — מיטב", and the tie creates the item "קרן השתלמות ניב — מיטב — ראנדקום בע"מ" for it
- **THEN** the child's display name is "קרן השתלמות ניב — מיטב — ראנדקום בע"מ", the name of the item it ends under

#### Scenario: File that was not split
- **WHEN** a client sends a one-page PDF "balance.pdf" that the classifier matches to a list document, or matches to nothing
- **THEN** the file is still shown as "balance.pdf"

#### Scenario: Planner's view
- **WHEN** the planner cycle runs after a child got a display name of either kind
- **THEN** the planner still sees the child under its stored file name with its page range and parent file id, and with the same content-analysis line as before
