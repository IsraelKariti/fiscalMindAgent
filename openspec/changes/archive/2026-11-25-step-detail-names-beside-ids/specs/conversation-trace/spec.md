## ADDED Requirements

### Requirement: A tool-call answer shows document and file names beside their ids
When the LLM call modal shows a tool-call answer (the planner), every id in a call's arguments that names one of the client's checklist items or received files SHALL be shown with its id exactly as recorded, and, immediately after it, an added field holding the name: a document id gains a `..._name` field with the checklist item's name, a file id gains a `..._name` field with the file's display name (the label when it has one, otherwise the stored file name), and a list of file ids gains a `..._names` field with the display names in the same order. The id field SHALL NOT be removed, renamed or rewritten. An id that matches no item or file of the call's client (a deleted file, a message id, an id of another client) SHALL gain no name field and SHALL stay as recorded. A call that has no client (a stage that is not about one client) SHALL show its arguments unchanged.

The names SHALL come from the server with the call, so the modal needs no further request, and they SHALL be served only to an admin, with the same refusal for a non-admin as the single-call request. An accountant's session SHALL never receive them.

"Copy details" of such a call SHALL include the same names, so the pasted text lets a reader without access to the site tell which item and which file every id means. The recorded answer in the copied text SHALL stay exactly as recorded; the names SHALL be added beside it, not written into it.

#### Scenario: Tie call with names
- **WHEN** an admin opens a planner call whose answer holds `tie_file` with `file_id: "1c52e631-…"` and `document_id: "a1ac6b1f-…"`, and that file is the client's "whatsapp-media-20261125-131858.pdf" and that document is "אישור יתרה להצהרת הון — קרן פנסיה הפניקס ליום 31.12.2025"
- **THEN** the tool-calls pane shows `file_id` with the recorded id, then `file_name: "whatsapp-media-20261125-131858.pdf"`, then `document_id` with the recorded id, then `document_name: "אישור יתרה להצהרת הון — קרן פנסיה הפניקס ליום 31.12.2025"`

#### Scenario: Failed answer is still readable
- **WHEN** a planner answer fails validation (no tool-call steps were recorded) and the admin opens its call from the trace
- **THEN** every `resolve_document`, `tie_file` and `add_instance` call in the pane shows the item and file names beside the ids, so the admin can tell which item the planner tried to close

#### Scenario: Unknown id
- **WHEN** a call's arguments hold `evidence_message_id` or a `file_id` of a file that no longer exists
- **THEN** that field shows only the recorded id and no name field is added

#### Scenario: Copy details carries the names
- **WHEN** the admin presses "copy details" on a planner call
- **THEN** the copied text holds the recorded response unchanged and, beside it, the names of every document and file id the answer mentions

#### Scenario: Accountant
- **WHEN** a signed-in accountant requests a single call
- **THEN** the request is refused as today and no names are sent
