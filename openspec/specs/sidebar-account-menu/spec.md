# sidebar-account-menu Specification

## Purpose
The menu that opens from the email row at the bottom of the workspace sidebar: which items it holds, who sees each item, and how it opens and closes. It keeps the rest of the sidebar free for the client list.

## Requirements

### Requirement: The email row opens the account menu
The email row at the bottom of the workspace sidebar SHALL show the FiscalMind logo next to the person's email, in place of the round avatar with the email's first letter. The row SHALL be a button for every person who sees the sidebar. A click on it SHALL open the account menu directly above the row, opening upward, and a second click SHALL close it. The menu SHALL also close on a click outside it and on the Escape key. The email row SHALL be visibly highlighted while the mouse pointer is over it and while the menu is open, and SHALL show a pointer cursor.

#### Scenario: Logo on the email row
- **WHEN** a signed-in person looks at the bottom of the sidebar
- **THEN** the row shows the FiscalMind logo and the person's email, and no letter avatar

#### Scenario: Hovering the email row
- **WHEN** the person moves the mouse pointer over the email row
- **THEN** the row's background becomes clearly lighter than the sidebar and the cursor becomes a pointer

#### Scenario: Highlight while the menu is open
- **WHEN** the account menu is open and the mouse pointer is elsewhere
- **THEN** the email row stays highlighted until the menu closes

#### Scenario: Opening the menu
- **WHEN** a signed-in accountant clicks the email row
- **THEN** the account menu appears above the row and the client list stays in place behind it

#### Scenario: Closing with a click outside
- **WHEN** the account menu is open and the person clicks a client in the list
- **THEN** the menu closes

#### Scenario: Closing with Escape
- **WHEN** the account menu is open and the person presses Escape
- **THEN** the menu closes

#### Scenario: Single-agent account
- **WHEN** an accountant with one enabled agent looks at the email row
- **THEN** the row is a button and opens the account menu

### Requirement: The account menu holds the brand, the agent, settings and logout
The account menu SHALL show, from top to bottom: the "FiscalMind" brand box (logo and name), the active agent's label (icon and name), the settings item and the logout item. Choosing the settings item SHALL open the agent's settings page and close the menu, and the settings item SHALL be marked as selected while the settings page is open. Choosing the logout item SHALL close the menu and start the same logout flow as before. The logout item SHALL NOT appear where the sidebar has no logout today (the monday embed). The brand box and the single agent label SHALL be plain labels, not buttons.

#### Scenario: Menu content for an accountant
- **WHEN** an accountant with one enabled agent, "הצהרת הון", opens the account menu
- **THEN** the menu shows the "FiscalMind" brand box, the "הצהרת הון" label with its icon, "הגדרות" and "התנתקות", in that order

#### Scenario: Opening settings from the menu
- **WHEN** the person chooses "הגדרות" in the account menu
- **THEN** the settings page opens and the menu closes

#### Scenario: Settings marked while open
- **WHEN** the settings page is open and the person opens the account menu
- **THEN** the "הגדרות" item is marked as selected

#### Scenario: Logging out from the menu
- **WHEN** the person chooses "התנתקות" in the account menu
- **THEN** the menu closes and the logout confirmation appears, as it did from the old sidebar link

#### Scenario: monday embed
- **WHEN** the sidebar is shown inside monday and the person opens the account menu
- **THEN** the menu shows the brand box, the agent label and "הגדרות", and no logout item

### Requirement: The viewing-as box sits in the account menu
While an admin views the workspace as an accountant, the account menu SHALL show the "viewing as" box with the accountant's email and the exit button, between the agent label and the settings item. The exit button SHALL end the view-as session as before. The box SHALL NOT appear in the menu outside a view-as session.

#### Scenario: Admin viewing as an accountant
- **WHEN** an admin viewing the workspace as an accountant opens the account menu
- **THEN** the menu shows "צפייה בתור" with the accountant's email and an exit button

#### Scenario: Exiting view-as from the menu
- **WHEN** the admin clicks the exit button in the menu
- **THEN** the view-as session ends and the admin panel opens, as it did from the old sidebar box

#### Scenario: Accountant's own session
- **WHEN** an accountant in their own session opens the account menu
- **THEN** the menu shows no "viewing as" box

### Requirement: Agent switching lives in the account menu
On an account with more than one enabled agent, the account menu SHALL list every enabled agent in place of the single agent label, with a check mark on the active one. Choosing another agent SHALL switch the workspace to it and close the menu. The menu SHALL also keep the "all agents" item that opens the agents home page.

#### Scenario: Switching agent
- **WHEN** an accountant with two enabled agents opens the account menu and chooses the agent that is not active
- **THEN** the workspace switches to that agent and the menu closes

#### Scenario: Active agent marked
- **WHEN** an accountant with two enabled agents opens the account menu
- **THEN** both agents are listed and only the active one carries a check mark

### Requirement: The sidebar shows only the client list and the email row
Outside the account menu, the workspace sidebar SHALL NOT show the brand box, the agent label, the settings link, the logout link or the "viewing as" box. The sidebar SHALL show the client list area (add-client control, deleted-clients toggle, tax advisor picker, questions toggle, search box, status filter and client rows, each under its own existing rules) and, pinned at the bottom, the email row.

#### Scenario: Sidebar with the menu closed
- **WHEN** an admin viewing as an accountant looks at the sidebar with the account menu closed
- **THEN** the sidebar starts with the client list controls at the top and ends with the email row, with no brand box, agent label, settings link, logout link or "viewing as" box in between
