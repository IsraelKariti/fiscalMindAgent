# planner-answer-schema Specification

## Purpose
The shape of the conversation planner's answer form: which fields the model may fill, how a follow-up message is expressed for a WhatsApp-only agent, which field groups the code removes for a given client, and the budget of "value or null" places the form may hold so that every model provider accepts it.

## Requirements

### Requirement: A follow-up answer carries one WhatsApp message and no channel choice
The planner's answer form SHALL NOT contain a channel field or any email field (subject, body). A `follow_up` answer SHALL carry exactly one WhatsApp message: either a free-form text (allowed only while the 24-hour WhatsApp window is open) or an approved template with its variables. The code SHALL derive the channel (always WhatsApp) and the message kind (free-form or template) from which of the two fields is filled. An answer that fills both, or neither, SHALL be rejected by the `validate_message` gate with a message naming the two fields. The planner prompt SHALL NOT ask the model to choose a channel and SHALL NOT describe the email channel as an option.

#### Scenario: Free-form message inside the window
- **WHEN** the planner answers `follow_up` with `whatsapp_text` filled, `whatsapp_template` null and a valid `send_at`, and the 24-hour window is open
- **THEN** the gate accepts the answer and the scheduled draft is a WhatsApp free-form message with that text

#### Scenario: Template message outside the window
- **WHEN** the planner answers `follow_up` with `whatsapp_template` naming an approved template and the right number of variables, `whatsapp_text` null, and the window is closed
- **THEN** the gate accepts the answer and the scheduled draft is a WhatsApp template message rendered from that template

#### Scenario: Both message fields filled
- **WHEN** the planner answers `follow_up` with both `whatsapp_text` and `whatsapp_template` filled
- **THEN** the gate rejects the answer, the `business_rules` note names both fields, and the model gets one corrective retry

#### Scenario: No message on a follow-up
- **WHEN** the planner answers `follow_up` with both `whatsapp_text` and `whatsapp_template` null
- **THEN** the gate rejects the answer with a note that a follow-up needs exactly one WhatsApp message

#### Scenario: Answer with a channel field
- **WHEN** the model's answer contains a `channel`, `email_subject` or `email_body` key
- **THEN** the answer fails the `json_schema` check (the form has no such field) and the model gets one corrective retry

### Requirement: The request schema lists only the groups this client can use
Before each planner call the code SHALL build the request schema from the full answer form minus the field groups the client cannot use in this call: the tax-authority fetch fields when no fetch provider is offered to the client, and the checklist-change and final-confirmation fields when the agent has no intake. The message fields SHALL always be present. When the answer returns, every removed field SHALL be refilled with its empty value (null, or an empty list for `stated_costs`) so that the rest of the code sees the full form.

#### Scenario: Capital declaration without a fetch offer
- **WHEN** the planner runs for a capital-declaration client to whom no fetch provider is offered
- **THEN** the request schema has no `tax_fetch_action`, `tax_fetch_provider` or `tax_fetch_document_keys`, and the parsed answer still has those three fields as null

#### Scenario: Message fields never removed
- **WHEN** the planner runs for any client
- **THEN** the request schema contains `whatsapp_text`, `whatsapp_template` and `send_at`

### Requirement: The WhatsApp-only form stays under the Anthropic budget
The number of "value or null" places (nullable fields, including nullable fields inside list items) in the request schema built for a capital-declaration client without a fetch offer SHALL be at most 15. A unit test SHALL count these places on the real schema and fail when the count exceeds 15, so that adding a nullable field forces a conscious decision about the budget.

#### Scenario: Budget test on the current form
- **WHEN** the budget test runs against the current answer form after this change
- **THEN** it counts 15 places and passes

#### Scenario: A nullable field is added later
- **WHEN** a developer adds a sixteenth nullable place to the form without removing another
- **THEN** the budget test fails and names the count it found
