# workspace-documents Specification

## Purpose
What the workspace documents tab shows an accountant about one client: the required-documents checklist, the files received for each item, and the files that matched no item.

## Requirements

### Requirement: One card lists documents and their files
The documents tab SHALL show a single required-documents card. It SHALL NOT show a separate card that lists all received files.

#### Scenario: Documents tab layout
- **WHEN** an accountant opens a client's documents tab
- **THEN** the tab shows the required-documents card and no separate "files received" card

### Requirement: Linked files appear under their checklist item
Every received file that is linked to a checklist item SHALL appear as its own sub-row under that item. Each sub-row SHALL show the file's display name (label when present, otherwise filename), its size and received date, its content-analysis line, and view and download controls.

#### Scenario: Single linked file
- **WHEN** a checklist item has exactly one linked file
- **THEN** the item shows one sub-row with that file's name, size, date, analysis line, and view/download controls

#### Scenario: Several linked files
- **WHEN** a checklist item has more than one linked file (for example two uploads of the same document, or several employers' 106 forms)
- **THEN** the item shows one sub-row per file, oldest first, and every file has its own view/download controls

### Requirement: Content-analysis line per file
Each file sub-row SHALL show the result of the content analysis. When analysis is done, the line SHALL state the identified document kind and, when known, the tax year and subject name. When analysis is not done, the line SHALL show a status badge: pending, failed, or unsupported. A file the platform fetched itself (analysis status "not needed") SHALL show a neutral "fetched automatically from the site" badge with a tooltip explaining that content analysis does not apply, and SHALL NOT be shown as pending. A file blocked by the injection filter SHALL show a "blocked" badge instead of a verdict. A done analysis that suspects prompt injection SHALL add a "suspicious content" badge, and one that found the file not legible SHALL add a "not legible" badge.

#### Scenario: Analysis done
- **WHEN** a file's analysis finished and identified a bank balance for tax year 2025 for "Israel Kariti"
- **THEN** its sub-row shows a line naming the document kind, the tax year, and the subject name

#### Scenario: Analysis pending
- **WHEN** a file was received but its analysis has not finished
- **THEN** its sub-row shows a "not yet analyzed" badge and no verdict line

#### Scenario: Fetched file
- **WHEN** a file was fetched by the platform from an external site (status "not needed")
- **THEN** its sub-row shows a "fetched automatically from the site" badge with a tooltip, and not the "not yet analyzed" badge

#### Scenario: Blocked file
- **WHEN** the injection filter blocked a file
- **THEN** its sub-row shows a "blocked" badge with an explanatory tooltip and no verdict line

#### Scenario: Suspicious content
- **WHEN** a file's analysis finished and flagged suspected prompt injection
- **THEN** its sub-row shows the verdict line together with a "suspicious content" badge

### Requirement: Unmatched files group
Files linked to no checklist item SHALL appear in a "files not matched to a required document" group at the bottom of the required-documents card. Each entry SHALL show the same file detail and controls as a linked-file sub-row. The group SHALL be shown only when at least one such file exists, and its title SHALL include the count.

#### Scenario: A file matched nothing
- **WHEN** a client sent a file whose analysis matched no required document
- **THEN** the card shows the unmatched group with that file, its analysis line, and view/download controls

#### Scenario: All files matched
- **WHEN** every received file is linked to a checklist item
- **THEN** the unmatched group is not shown

#### Scenario: File later linked
- **WHEN** an unmatched file becomes linked to a checklist item and the tab is refreshed
- **THEN** the file moves from the unmatched group to a sub-row under that item

### Requirement: Progress count unchanged
The card's header progress badge SHALL keep counting checklist items (approved out of in-goal items), not files. Unmatched files SHALL NOT change the count.

#### Scenario: Unmatched file does not affect progress
- **WHEN** a client has five of six items approved and one unmatched file
- **THEN** the header badge still reads five of six

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
