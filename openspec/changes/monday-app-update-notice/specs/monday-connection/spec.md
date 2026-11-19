## MODIFIED Requirements

### Requirement: The accountant grants missing permissions with one click and one approval
When the connection status lists missing permissions, the monday account row on the workspace Settings page SHALL show a warning notice saying the agent needs new monday permissions and naming what stops working until they are granted. The notice SHALL give two steps in order: step 1, "update the FiscalMind app on your monday account", as a link to the app's install page (`https://auth.monday.com/oauth2/authorize?client_id=<client id>&response_type=install`, built by the server from the configured client id and returned on the connection status as `installUrl`, opened in a new tab); step 2, one button "Update monday permissions". Pressing the button SHALL open the monday approval popup directly, without disconnecting first. After the accountant approves, the stored token and scopes SHALL be replaced, the page SHALL refresh the status by itself, and the notice SHALL disappear. The notice SHALL NOT be shown when nothing is missing or when the account is not connected. An admin viewing the workspace as the accountant SHALL see and use the same notice. The same row and notice SHALL appear inside the monday custom object, which mounts the same Settings panel.

#### Scenario: Missing permission granted
- **WHEN** the status lists `users:read` as missing and the accountant presses "Update monday permissions" and approves in the popup
- **THEN** the popup closes, the stored scopes now include `users:read`, and the Settings row shows "monday connected" with no notice

#### Scenario: Approval cancelled
- **WHEN** the accountant presses "Update monday permissions" and closes the popup without approving
- **THEN** the stored token is unchanged and the notice stays

#### Scenario: Nothing missing
- **WHEN** the stored scopes cover every requested scope
- **THEN** the row shows the connected badge and the Disconnect control only, with no notice and no update button

#### Scenario: Install link
- **WHEN** the notice is shown and the client id is configured
- **THEN** step 1 links to the app's install page built from that client id, and the link opens in a new tab

#### Scenario: Client id not configured
- **WHEN** the connection is not configured on the server
- **THEN** the status reply carries no install link and the row shows the "not configured" text as before
