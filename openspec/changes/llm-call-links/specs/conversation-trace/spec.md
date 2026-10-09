## ADDED Requirements

### Requirement: Every LLM call has its own link
Every LLM call shown in the trace (the call chips in the workspace conversation tab under impersonation and in the admin conversation viewer) and in the admin call browser SHALL have a stable link of the form `<site origin>/#/llm-calls/<call id>`, where the call id is the id of the call's `llm_calls` row. The link SHALL NOT depend on the client, the agent, or the accountant, and SHALL keep working for as long as the call row exists.

Opening a call link as an admin, whether impersonating or not, SHALL show that call in the call detail modal with the same content as opening it from a trace chip (stage label and key, file label, outcome badge, when/model/client/attempts/duration, token tiles, error, system instruction, history, query, response, schema, and the document pane when the call read a file). Closing the modal SHALL leave the admin on a normal page of the app (the admin call browser when not impersonating, as today; the workspace when impersonating), not on a blank page. A link whose id is malformed or matches no call SHALL show an in-app "call not found" message, never a browser-native dialog and never a broken page.

The link adds no new audience: a signed-in user who is not an admin SHALL NOT receive the call's data, and the server SHALL answer a non-admin request for a single call with the same refusal as the other admin endpoints.

#### Scenario: Open a call link while impersonating
- **WHEN** an admin who is impersonating an accountant opens `https://<site>/#/llm-calls/<id>` of a `file_classification` call
- **THEN** the call detail modal opens on that call, showing its prompt, response and the document it read, and after closing it the admin is in that accountant's workspace

#### Scenario: Open a call link without impersonation
- **WHEN** an admin who is not impersonating anyone opens a call link
- **THEN** the call detail modal opens over the admin call browser, as it does today

#### Scenario: Unknown call
- **WHEN** an impersonating admin opens a call link whose id matches no call row
- **THEN** an in-app message says the call was not found, with a way back to the app

#### Scenario: Accountant opens a call link
- **WHEN** a signed-in accountant opens a call link
- **THEN** no call data is shown or sent, and the accountant lands in their own workspace

### Requirement: The call detail modal copies the call's link
The call detail modal SHALL show a "copy link" button at its top, beside the title, on every call, wherever the modal is opened (trace chip in either trace surface, admin call browser, call link). Pressing it SHALL copy the call's full link (origin included) to the clipboard and SHALL confirm the copy inside the button (for example a check mark for a moment), without a browser-native dialog. The button SHALL be reachable by keyboard and SHALL carry an accessible name.

#### Scenario: Copy from the workspace trace
- **WHEN** an impersonating admin opens a call chip in the workspace conversation tab and presses "copy link"
- **THEN** the clipboard holds `<site origin>/#/llm-calls/<that call's id>` and the button shows the copied state

#### Scenario: Copy from the admin call browser
- **WHEN** an admin opens a call in the admin call browser and presses "copy link"
- **THEN** the clipboard holds the link of that call, and opening it shows the same call

### Requirement: The call detail modal copies the call's full details as text
Next to "copy link", the call detail modal SHALL show a "copy details" button on every call, wherever the modal is opened. Pressing it SHALL copy plain text made of the call's full link on the first line, followed by the call's complete recorded data as formatted JSON: id, time, stage key (`purpose`), provider, model, status and error, attempts, duration, the four token counts with their prices and the cost, client id and name, agent instance id, the file id and name the call read, the whole request (model, system instruction, contents, config including the response schema) and the raw response text. Nothing the modal shows SHALL be missing from the copied text. The text SHALL be complete on its own, so a reader with no access to the site or its database (for example Claude, given a call from production) can understand the call from the paste alone.

The button SHALL confirm the copy inside the button, SHALL NOT use a browser-native dialog, SHALL be reachable by keyboard, and SHALL carry an accessible name distinct from "copy link". It adds no new audience: it exists only inside the admin-only modal.

#### Scenario: Copy a failed call from production
- **WHEN** an admin on the production site opens a `verify_extraction` call that ended in error and presses "copy details"
- **THEN** the clipboard holds the production link of that call on the first line, then JSON that includes `status: "error"`, the error text, the system instruction and the query the model received

#### Scenario: Copied text matches the modal
- **WHEN** an admin presses "copy details" on any call
- **THEN** the system instruction, contents, schema and response in the copied text equal the ones the modal's panes show

#### Scenario: Call without a file
- **WHEN** an admin presses "copy details" on a `planner` call
- **THEN** the copied JSON carries `documentFileId: null` and `documentFileName: null`, and everything else is present
