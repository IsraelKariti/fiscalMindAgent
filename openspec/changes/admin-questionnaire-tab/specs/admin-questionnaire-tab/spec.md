## Purpose
How an admin viewing the workspace as an accountant reads the questionnaire a declaration-of-capital client submitted before the conversation started, and who else can see it (nobody).

## ADDED Requirements

### Requirement: A declaration-of-capital client has an admin-only questionnaire tab
While an admin views the workspace as an accountant, every declaration-of-capital client view SHALL show one more client tab labeled "שאלון" (questionnaire), after the existing tabs. The tab SHALL be visibly marked as an admin-only tab with the same "admin only" marker and distinct colour used by the Settings test tab. The accountant's own session and a staff viewer's session SHALL NOT show the tab, and a remembered tab choice of "questionnaire" SHALL fall back to the Conversation tab when the view is not an admin's view-as session.

#### Scenario: Admin sees the tab
- **WHEN** an admin viewing as an accountant opens a declaration-of-capital client
- **THEN** the client tabs are conversation, dashboard, documents, details, questionnaire, and the questionnaire tab carries the admin-only marker

#### Scenario: Accountant does not see the tab
- **WHEN** the accountant opens the same client in their own session
- **THEN** no questionnaire tab is shown

#### Scenario: Staff viewer does not see the tab
- **WHEN** a staff viewer opens the same client
- **THEN** no questionnaire tab is shown

#### Scenario: Remembered tab outside view-as
- **WHEN** the questionnaire tab was the last open tab for a client and that client is next opened outside an admin's view-as session
- **THEN** the Conversation tab opens

### Requirement: The tab shows the submitted questionnaire as stored on the client
The questionnaire tab SHALL list the question/answer pairs stored on the client at enrollment (the monday kickoff or the admin test form), in the stored order, one card per pair: the question as the card title and the client's answer beneath it. Answers SHALL be rendered as plain text with line breaks preserved; no part of an answer SHALL be interpreted as markup or a link. The tab SHALL read the pairs from the client record the workspace already loads and SHALL NOT read any monday board or call any new server route.

#### Scenario: Kickoff client with answers
- **WHEN** a client was enrolled from a monday form whose answered questions were "האם יש לך רכב?" → "לא" and "חשבונות בנק" → "לאומי, הפועלים"
- **THEN** the tab shows two cards in that order, the first titled "האם יש לך רכב?" with the answer "לא", the second titled "חשבונות בנק" with the answer "לאומי, הפועלים"

#### Scenario: Test client with answers
- **WHEN** an admin created a test client with the questionnaire answer "no" to "do you have a vehicle?"
- **THEN** the tab shows one card titled "do you have a vehicle?" with the answer "no"

#### Scenario: Answer that looks like markup
- **WHEN** a stored answer contains "<b>כן</b>" or a URL
- **THEN** the card shows the characters literally, not bold text or a clickable link

#### Scenario: Read-only
- **WHEN** the admin views the tab
- **THEN** no control to edit, delete or re-fetch an answer is offered

### Requirement: A client without a stored questionnaire shows an empty state
When the client record holds no questionnaire pairs, the tab SHALL show a short empty-state text saying no questionnaire is stored for this client, and SHALL note that only answered questions are stored (blank answers are not kept).

#### Scenario: Client enrolled without a form
- **WHEN** an admin opens the questionnaire tab of a client whose record holds no questionnaire pairs
- **THEN** the tab shows the empty-state text and no cards

#### Scenario: Deleted client under view-as
- **WHEN** an admin opens a soft-deleted client that holds questionnaire pairs
- **THEN** the questionnaire tab shows the cards as stored, like any other tab of a deleted client
