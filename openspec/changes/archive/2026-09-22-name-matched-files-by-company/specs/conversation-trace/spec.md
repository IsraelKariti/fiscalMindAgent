## MODIFIED Requirements

### Requirement: Apply steps record what they changed by name
The planner's apply steps SHALL record, in their audit detail, a human-readable name for every document they touched, alongside the id: `apply_resolutions` (document name and verdict per row), `apply_additions` (anchor document name per entry, with the instance names already recorded), `apply_retirements` (document name and evidence quote per row), `apply_collections` (names for the proposed, collected and claimed documents, the file name and document name for each pair, and, when a tie split an item that names no company by company, the renamed item with its old and new name and every created item with its name and the file that created it), and the `document.collected` row (document names). Rows written before this change are not rewritten.

#### Scenario: Retirement recorded with its name
- **WHEN** the planner retires the document "אישור יתרות — בנק הפועלים" with an evidence quote
- **THEN** the `apply_retirements` audit row lists that document with its id, its name and the quote

#### Scenario: Collection recorded with names
- **WHEN** the planner marks two documents collected and links one received file to one of them
- **THEN** the `apply_collections` row lists the two document names under collected, and the pair shows the file name with the document name

#### Scenario: Company split recorded
- **WHEN** the planner ties Harel and Clal files to the item "ביטוח מנהלים ניב" and code splits it by company
- **THEN** the `apply_collections` row lists the rename "ביטוח מנהלים ניב" → "ביטוח מנהלים ניב — הראל", the created item "ביטוח מנהלים ניב — כלל" with the Clal file's name, and the pairs show each file with the item it ended under; the step modal shows these lines
