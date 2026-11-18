## ADDED Requirements

### Requirement: The connection status names the permissions the app still lacks
The connection-status reply for the signed-in accountant SHALL include the list of monday permissions (OAuth scopes) that the app currently requests but the stored token was not granted. Comparison SHALL treat the stored scope string as an unordered set of scope names, ignoring order, repeated spaces and case of separators, so that a token granted with the same scopes in another order has no missing permissions. An accountant with no stored token SHALL get an empty list (not connected is reported separately).

#### Scenario: Token granted before a scope was added
- **WHEN** the stored token's scopes are `boards:read boards:write docs:read` and the app requests `boards:read boards:write docs:read users:read`
- **THEN** the status reply reports connected and lists `users:read` as missing

#### Scenario: Same scopes in another order
- **WHEN** the stored token's scopes are `users:read docs:read boards:write boards:read` and the app requests `boards:read boards:write docs:read users:read`
- **THEN** the status reply reports no missing permissions

#### Scenario: Not connected
- **WHEN** the accountant has no stored monday token
- **THEN** the status reply reports not connected and an empty missing list

### Requirement: The accountant grants missing permissions with one click and one approval
When the connection status lists missing permissions, the monday account row on the workspace Settings page SHALL show a warning notice saying the agent needs new monday permissions and naming what stops working until they are granted, with one button "Update monday permissions". Pressing the button SHALL open the monday approval popup directly, without disconnecting first. After the accountant approves, the stored token and scopes SHALL be replaced, the page SHALL refresh the status by itself, and the notice SHALL disappear. The notice SHALL NOT be shown when nothing is missing or when the account is not connected. An admin viewing the workspace as the accountant SHALL see and use the same notice. The same row and notice SHALL appear inside the monday custom object, which mounts the same Settings panel.

#### Scenario: Missing permission granted
- **WHEN** the status lists `users:read` as missing and the accountant presses "Update monday permissions" and approves in the popup
- **THEN** the popup closes, the stored scopes now include `users:read`, and the Settings row shows "monday connected" with no notice

#### Scenario: Approval cancelled
- **WHEN** the accountant presses "Update monday permissions" and closes the popup without approving
- **THEN** the stored token is unchanged and the notice stays

#### Scenario: Nothing missing
- **WHEN** the stored scopes cover every requested scope
- **THEN** the row shows the connected badge and the Disconnect control only, with no notice and no update button

### Requirement: Re-running the connect flow while connected replaces the stored token
The OAuth start and callback routes SHALL accept a connect request from an accountant who already has a stored token. A successful callback SHALL overwrite the stored access token and scopes with the newly granted ones, and SHALL store the scope string monday returns (falling back to the requested scopes only when monday returns none).

#### Scenario: Connect while already connected
- **WHEN** an accountant with a stored token completes the monday approval again
- **THEN** one token row remains for that accountant, holding the new token and the scopes monday returned
