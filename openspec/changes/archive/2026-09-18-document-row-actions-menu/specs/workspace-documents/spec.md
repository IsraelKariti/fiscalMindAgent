## ADDED Requirements

### Requirement: Every checklist row shows its status
Each row of the capital-declaration documents list SHALL show a status badge that names the row's current status, for every status: unresolved, pending, claimed, collected, approved, not required and retired. The badge SHALL be the only element on the row that uses status wording.

#### Scenario: Pending row
- **WHEN** a checklist item is pending
- **THEN** its row shows a badge saying the document is awaited from the client

#### Scenario: Unresolved row
- **WHEN** a checklist item is unresolved
- **THEN** its row shows a badge saying the item is still being clarified with the client

#### Scenario: Not-required row
- **WHEN** a checklist item is not required
- **THEN** its row shows a "not required" badge, and no button on the row carries that wording

#### Scenario: Collected row with stalled verification
- **WHEN** a checklist item is collected and its verification stalled or is unavailable
- **THEN** its badge says verification failed, styled as a danger badge

### Requirement: Row actions live in one actions menu
Each row of the capital-declaration documents list SHALL offer its actions through a single actions-menu button at the end of the row. The row SHALL NOT show inline action buttons or a standalone remove button. Every action label in the menu SHALL be a verb phrase that describes what the action does, never a bare status name.

#### Scenario: Row at rest
- **WHEN** an accountant views a checklist row without opening its menu
- **THEN** the row shows the document name, description, status badge and one actions-menu button, and no other action control

#### Scenario: Opening the menu
- **WHEN** the accountant activates the actions-menu button
- **THEN** a menu opens next to the button listing the actions available for that row's status, with the remove action last and visually marked as destructive

#### Scenario: Choosing an action
- **WHEN** the accountant chooses an action from the menu
- **THEN** the menu closes, the action runs, and the list refreshes with the row in its new group

#### Scenario: Action in progress
- **WHEN** an action on the card is still running
- **THEN** the actions-menu buttons are disabled until it finishes

### Requirement: Actions offered per status
The actions menu SHALL offer exactly these actions per row status, each with the same effect it has today: unresolved — mark as required, mark as not required, remove; pending — mark as not required, remove; claimed — confirm receipt, remove; collected — approve manually, remove; approved, not required or retired — return to required, remove.

#### Scenario: Pending row menu
- **WHEN** the accountant opens the menu of a pending row
- **THEN** it lists "mark as not required" and "remove", and nothing else

#### Scenario: Unresolved row menu
- **WHEN** the accountant opens the menu of an unresolved row
- **THEN** it lists "mark as required", "mark as not required" and "remove"

#### Scenario: Not-required row menu
- **WHEN** the accountant opens the menu of a not-required row and chooses "return to required"
- **THEN** the row moves to the pending group

#### Scenario: Remove
- **WHEN** the accountant chooses "remove" from any row's menu
- **THEN** the checklist item is deleted, as the "×" button did before

### Requirement: The actions menu is an in-app, keyboard-operable popover
The actions menu SHALL be drawn by the app in the app's theme and SHALL NOT use a browser dialog or native popup. It SHALL close on Escape, on a click outside it, and when focus leaves it. It SHALL be operable by keyboard alone, and it SHALL stay fully inside the viewport in the right-to-left layout, including for rows at the bottom of the screen and inside the monday custom object.

#### Scenario: Escape closes
- **WHEN** the menu is open and the accountant presses Escape
- **THEN** the menu closes, no action runs, and focus returns to the actions-menu button

#### Scenario: Click outside closes
- **WHEN** the menu is open and the accountant clicks anywhere outside it
- **THEN** the menu closes and no action runs

#### Scenario: Keyboard use
- **WHEN** the accountant focuses the actions-menu button and presses Enter, moves with the arrow keys and presses Enter on an item
- **THEN** the menu opens, focus moves between items, and the chosen action runs

#### Scenario: Row near the bottom edge
- **WHEN** the accountant opens the menu of a row that has no room below it
- **THEN** the menu opens upward and is fully visible

#### Scenario: Only one menu open
- **WHEN** one row's menu is open and the accountant opens another row's menu
- **THEN** the first menu closes
