## MODIFIED Requirements

### Requirement: The Settings view has an admin-only "test" tab
While an admin views the workspace as an accountant, the workspace Settings view SHALL show one more tab labeled "בדיקה" (test). The tab SHALL be visibly marked as an admin-only tab (an "admin only" marker and a distinct colour from the other tabs). The accountant's own session SHALL NOT show the tab, and a remembered tab choice of "test" SHALL fall back to the general tab when the view is not an admin's view-as session. The tab SHALL hold the test-client form and its submit button, and below it a separate group with the "re-read tax advisors" action (capability `client-tax-advisor`) and its last result.

#### Scenario: Admin sees the tab
- **WHEN** an admin viewing as an accountant opens the agent's Settings view
- **THEN** the tabs are general, connections, staff, test, analytics, documents, dashboard, and the test tab carries the admin-only marker

#### Scenario: Accountant does not see the tab
- **WHEN** the accountant opens the agent's Settings view in their own session
- **THEN** no test tab is shown

#### Scenario: Remembered tab after the session ended
- **WHEN** the test tab was the last open tab and the Settings view is next opened in the accountant's own session
- **THEN** the general tab opens

#### Scenario: Advisor action on the tab
- **WHEN** an admin viewing as an accountant opens the test tab
- **THEN** the test-client form is followed by a group holding the "re-read tax advisors" button, and no such group exists on any other tab
