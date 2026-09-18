# admin-impersonation Specification

## Purpose
How an admin's "view as accountant" session starts, stays alive while the admin works, ends after inactivity or on request, and what the workspace shows once it has ended.

## Requirements

### Requirement: User activity keeps the view-as session alive
While an admin views the workspace as an accountant, each request caused by the admin's own activity (opening a page, a client or a tab, or performing an action) SHALL extend the view-as session to a full idle period from that moment. The session SHALL have no fixed maximum length other than the admin's own sign-in session.

#### Scenario: Working for longer than the old limit
- **WHEN** an admin starts a view-as session and keeps opening clients and performing actions for two hours
- **THEN** every request is served as the accountant and the session is still active

#### Scenario: Activity resets the idle clock
- **WHEN** an admin performs an action 23 hours after their previous activity
- **THEN** the action succeeds and the session stays active for another full idle period from that action

### Requirement: The session ends after the idle period
The view-as session SHALL end when the idle period passes with no user activity. The idle period SHALL default to 24 hours and SHALL be changeable through a single deployment setting without a code change. Requests the workspace makes on its own — periodic refreshes and live-update streams — SHALL NOT count as activity and SHALL NOT extend the session.

#### Scenario: Idle past the limit
- **WHEN** an admin starts a view-as session, does nothing for more than the idle period, and then performs an action
- **THEN** the action is not performed and the server answers that the view-as session ended

#### Scenario: A forgotten open tab does not keep the session alive
- **WHEN** a workspace tab stays open and visible, refreshing itself in the background, and the admin does not touch it for more than the idle period
- **THEN** the session ends as if the tab had been closed

#### Scenario: Shorter idle period configured
- **WHEN** the deployment sets the idle period to 60 minutes and an admin is idle for 61 minutes
- **THEN** the session has ended

### Requirement: An ended session is reported distinctly, never served as the admin
Every workspace request SHALL declare which accountant's workspace it is for while view-as is active. When the server's view-as session for that accountant is not active — it idled out, was ended from another tab, or now targets a different accountant — the server SHALL reject the request with a distinct, machine-recognizable "view-as session ended" response. It SHALL NOT serve the request under the admin's own identity and SHALL NOT answer with a "not found" error. Admin-panel requests, the current-user lookup and sign-in/sign-out requests SHALL keep working regardless, so that a new session can be started.

#### Scenario: Load after expiry
- **WHEN** an admin opens another client inside an already-open accountant workspace after the view-as session idled out
- **THEN** the client data request is rejected as "view-as session ended", not as "Agent not found."

#### Scenario: Full page reload after expiry
- **WHEN** an admin reloads the browser page of an accountant's workspace link after the view-as session idled out
- **THEN** no workspace request is made under any identity, and the admin lands on that accountant's admin page, from which a new session continues to the linked agent and client

#### Scenario: Session ended in another tab
- **WHEN** an admin exits view-as in one tab and then performs an action in a second tab that still shows the accountant's workspace
- **THEN** the action is rejected as "view-as session ended" and nothing is changed under the admin's identity

#### Scenario: Session switched to another accountant
- **WHEN** an admin starts viewing as accountant B in one tab while a second tab still shows accountant A's workspace, and then acts in the second tab
- **THEN** the action is rejected as "view-as session ended" and accountant B's data is neither shown nor changed

#### Scenario: Starting again stays possible
- **WHEN** the view-as session has ended and the workspace asks to start a new one for the same accountant
- **THEN** that request is accepted and a new session starts

### Requirement: The workspace shows an ended-session dialog
When any workspace request is rejected as "view-as session ended", the workspace SHALL show one in-app dialog, styled by the app and not a browser popup, saying that the view-as session ended. The dialog SHALL offer to start a new view-as session for the same accountant and to go back to the admin panel. The workspace SHALL NOT show the raw error in a banner, and SHALL show the dialog once even when several requests are rejected together.

#### Scenario: Action after expiry
- **WHEN** an admin clicks an action in the workspace after the session ended
- **THEN** the ended-session dialog appears and no error banner with "Agent not found." is shown

#### Scenario: Background refresh after expiry
- **WHEN** the session ends while a client page is open and the page's next background refresh is rejected
- **THEN** the ended-session dialog appears without the admin having clicked anything

#### Scenario: Start again returns to the same place
- **WHEN** the admin chooses "start a new session" in the dialog while on a specific agent and client
- **THEN** a new view-as session starts for the same accountant and the workspace reopens on the same agent and client

#### Scenario: Back to the admin panel
- **WHEN** the admin chooses "back to the admin panel" in the dialog
- **THEN** the view-as state is cleared and the admin panel opens

#### Scenario: Several rejected requests
- **WHEN** a page load fires several requests at once and all are rejected as "view-as session ended"
- **THEN** exactly one dialog is shown

### Requirement: Session lifecycle is audited
Starting a view-as session, stopping it on request, and its expiry through inactivity SHALL each be recorded in the audit trail with the real admin as the actor and the accountant as the target. Extending the session through activity SHALL NOT create audit entries. Actions performed while viewing as an accountant SHALL remain attributed to the real admin.

#### Scenario: Idle expiry is recorded
- **WHEN** a view-as session idles out and the admin's next workspace request is rejected
- **THEN** the audit trail holds an entry saying that the admin's view-as session for that accountant expired

#### Scenario: Extension is silent
- **WHEN** an admin works in the workspace for an hour
- **THEN** the audit trail holds the session start and the admin's actions, and no entries for session extension
