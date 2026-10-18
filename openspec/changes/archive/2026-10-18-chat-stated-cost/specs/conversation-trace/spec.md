## MODIFIED Requirements

### Requirement: Apply steps record what they changed by name
The planner's apply steps SHALL record, in their audit detail, a human-readable name for every document they touched, alongside the id: `apply_resolutions` (document name and verdict per row), `apply_additions` (anchor document name per entry, with the instance names already recorded), `apply_retirements` (document name and evidence quote per row), `apply_stated_costs` (document name, amount, currency and evidence quote per stated cost — the `chat-stated-cost` capability), `apply_collections` (names for the proposed, collected and claimed documents, the file name and document name for each pair, and, when a tie split an item that names no company by company, the renamed item with its old and new name and every created item with its name and the file that created it), and the `document.collected` row (document names). Rows written before this change are not rewritten.

#### Scenario: Retirement recorded with its name
- **WHEN** the planner retires the document "אישור יתרות — בנק הפועלים" with an evidence quote
- **THEN** the `apply_retirements` audit row lists that document with its id, its name and the quote

#### Scenario: Stated cost recorded with its name
- **WHEN** the planner states 85000 ILS on the document "הצהרת עלות — מאזדה 3" with the quote "אין לי את הקבלה, שילמתי 85,000 ש"ח"
- **THEN** the `apply_stated_costs` audit row lists that document with its id, its name, 85000, ILS and the quote, and the step modal shows these lines

#### Scenario: Collection recorded with names
- **WHEN** the planner marks two documents collected and links one received file to one of them
- **THEN** the `apply_collections` row lists the two document names under collected, and the pair shows the file name with the document name

#### Scenario: Company split recorded
- **WHEN** the planner ties Harel and Clal files to the item "ביטוח מנהלים ניב" and code splits it by company
- **THEN** the `apply_collections` row lists the rename "ביטוח מנהלים ניב" → "ביטוח מנהלים ניב — הראל", the created item "ביטוח מנהלים ניב — כלל" with the Clal file's name, and the pairs show each file with the item it ended under; the step modal shows these lines

## ADDED Requirements

### Requirement: Every message bubble is addressable
Every message bubble in the workspace conversation (inbound and outbound, both trace surfaces) SHALL carry a stable anchor derived from the message id, so another part of the workspace can scroll to that message and highlight it. Highlighting SHALL be a brief visual emphasis of the bubble in the app's theme, never a browser dialog, and SHALL not move the conversation's auto-scroll position afterwards.

#### Scenario: Scroll to a message
- **WHEN** the documents card asks the conversation to show the message a stated cost rests on
- **THEN** the Conversation tab is shown, the list scrolls so that bubble is in view, and the bubble is emphasised for a moment

#### Scenario: Message missing
- **WHEN** the requested message id matches no bubble in the loaded conversation
- **THEN** nothing scrolls, nothing is highlighted, and no error is shown
