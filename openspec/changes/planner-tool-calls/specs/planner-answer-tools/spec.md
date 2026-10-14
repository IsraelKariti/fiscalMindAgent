## Purpose

How the conversation planner answers: a set of small tools, each with a flat parameter list, that the model calls in one turn; which tools are offered for a given call; how the calls are assembled into one planning decision; and the shape limits every tool keeps so that every model provider accepts the request.

## ADDED Requirements

### Requirement: The planner answers with tool calls, in one turn
The `generate_message` stage SHALL offer the model a set of tools and SHALL force a tool answer (the model may not answer in plain text). The model SHALL answer in a single turn with one or more tool calls; the system SHALL NOT send tool results back to the model and SHALL NOT run a second model turn except the one corrective retry of the `validate_message` gate. Plain text in the answer SHALL be ignored. The same contract SHALL hold on every model provider the admin can select for this stage (Gemini, Anthropic, OpenAI).

#### Scenario: Follow-up answer with a message
- **WHEN** the model answers with the calls `conclude(decision: "follow_up", reasoning: …)` and `send_whatsapp_text(text: …, send_at: "asap")`
- **THEN** the gate accepts the answer and the stored draft is a WhatsApp free-form message with that text, sent as soon as possible

#### Scenario: Collecting answer in one turn
- **WHEN** the model answers with `conclude(decision: "collect", …)`, `tie_file(file_id: F, document_id: D, …)` and `resolve_document(…)` in the same turn
- **THEN** all three calls are applied in this cycle: the file is tied, the row is resolved, and no message is drafted until the verification of the tied file

#### Scenario: Model answers in text only
- **WHEN** the model returns no tool call
- **THEN** the gate rejects the answer with a note that the answer must be tool calls, and the model gets one corrective retry

### Requirement: The tool set and its parameters
The tools offered SHALL be exactly these, with these parameters; every parameter SHALL be required; "none" SHALL be the empty value of the parameter's type (`''` for text, `[]` for a list, `0` for a number); no parameter SHALL admit null and no parameter SHALL be a list of objects or an object inside an object.

- `conclude(decision, reasoning)`: `decision` one of `goal_complete`, `follow_up`, `collect` (`collect` absent in the after-verification cycle). Exactly one call per answer.
- `send_whatsapp_text(text, send_at)`: a free-form WhatsApp message and its send time (`"YYYY-MM-DD HH:MM"` in the accountant's timezone, or `asap`).
- `send_whatsapp_template(template_id, variables, send_at)`: an approved template, its variables (list of text) and the send time.
- `mark_collected(document_id)`: a required-document row the client provided without a file in this thread (claimed).
- `tie_file(file_id, document_id, evidence_message_id, evidence_quote)`: a received file is this required document; the evidence pair is `''`/`''` when code can confirm the match itself.
- `resolve_document(document_id, resolution, evidence_message_id, evidence_quote)`: `resolution` one of `required`, `not_required`; the evidence is the client's own words.
- `add_instance(anchor_document_id, name, description, already_provided, file_ids, paper_key, evidence_message_id, evidence_quote, proven_by_file_id)`: one concrete item under a catalog row (a row resolved `required` in this same answer, or an already-resolved row); `paper_key` one of the catalog papers or `''`; exactly one of the evidence pair or `proven_by_file_id` is non-empty.
- `state_cost(document_id, instance_name, amount, currency, evidence_message_id, evidence_quote)`: a purchase cost the client stated in the chat, for an existing item (`document_id` set, `instance_name` `''`) or for an item added in this same answer (`document_id` `''`, `instance_name` equal to that `add_instance` call's `name`).
- `retire_document(document_id, evidence_message_id, evidence_quote, proven_by_file_id)`: exactly one of the evidence pair or `proven_by_file_id` is non-empty.
- `attestation(action, evidence_message_id, evidence_quote)`: `action` one of `request` (this answer's message is the closing summary; evidence `''`/`''`) or `confirmed` (the client confirmed the summary; evidence required). One tool with an action, not two tools: a tool without parameters is not accepted by every provider.
- `tax_fetch(action, provider, document_keys)`: `action` one of `client_agreed`, `start_login`, `cancel`; `document_keys` `[]` means all pending documents of the provider.

#### Scenario: Cost of a new item in the same answer
- **WHEN** the model calls `add_instance(anchor_document_id: R, name: "דירה ברחוב הרצל", …, paper_key: "cost_declaration")` and `state_cost(document_id: "", instance_name: "דירה ברחוב הרצל", amount: 1850000, currency: "ILS", evidence_message_id: M, evidence_quote: "…1,850,000…")`
- **THEN** the new item is created with that stated cost, exactly as the 12 Oct 2026 form did with its nested sub-form

#### Scenario: Stated cost names an unknown item
- **WHEN** the model calls `state_cost` with `document_id` `''` and an `instance_name` that no `add_instance` call of the same answer uses
- **THEN** the gate rejects the answer with a note naming the instance name, and the model gets one corrective retry

#### Scenario: Empty value instead of null
- **WHEN** the model calls `tie_file` with `evidence_message_id: ""` and `evidence_quote: ""` for a file whose company code confirms
- **THEN** the call is read as "no evidence given" and the match is accepted on code evidence alone, as the form's null evidence was

### Requirement: Only the tools this call can use are offered
Before each planner call the system SHALL build the tool set from the full set minus the tools the client cannot use in this call: the checklist tools (`resolve_document`, `add_instance`, `state_cost`, `retire_document`, `attestation`) when the agent has no intake; `tax_fetch` when no fetch provider is offered; `mark_collected` and `tie_file`, and the `collect` value of `conclude`, in the follow-up cycle after a verification batch. `conclude`, `send_whatsapp_text` and `send_whatsapp_template` SHALL always be offered. A call naming a tool that was not offered SHALL fail the `tool_calls` check.

#### Scenario: Capital declaration without a fetch offer
- **WHEN** the planner runs for a capital-declaration client to whom no fetch provider is offered
- **THEN** the request carries every tool except `tax_fetch`

#### Scenario: After-verification cycle
- **WHEN** the follow-up cycle after a verification batch runs
- **THEN** the request carries no `mark_collected` and no `tie_file`, and `conclude.decision` offers only `goal_complete` and `follow_up`

### Requirement: Calls are assembled into one decision before the business rules
The system SHALL assemble the calls of one answer into a single planning decision and SHALL then apply the existing business rules unchanged (evidence quotes from stored inbound messages, instance caps and paper checks, the window/template rules, the attestation gate, the collect/follow-up separation). Assembly SHALL reject, with a corrective retry: zero or more than one `conclude`; more than one `send_*` call; more than one `attestation` call; `tax_fetch` more than once; `resolve_document` twice for one row; a `state_cost` with both or neither of `document_id` and `instance_name`, or naming an instance no `add_instance` of the answer has. A `follow_up` SHALL carry exactly one `send_*` call; a `collect` and a `goal_complete` SHALL carry none. Instances added under a row that this answer resolves `required` SHALL become that resolution's instances; instances added under an already-resolved row SHALL become one addition per row, all of that row's `add_instance` calls together (the evidence of the first call that gives one).

#### Scenario: Two conclude calls
- **WHEN** the model answers with two `conclude` calls
- **THEN** the gate rejects the answer with a note that `conclude` must be called exactly once, and the model gets one corrective retry

#### Scenario: Follow-up without a message
- **WHEN** the model answers `conclude(decision: "follow_up")` and no `send_*` call
- **THEN** the gate rejects the answer with a note that a follow-up needs exactly one WhatsApp message

#### Scenario: Both message tools called
- **WHEN** the model calls `send_whatsapp_text` and `send_whatsapp_template` in the same answer
- **THEN** the gate rejects the answer, the note names both tools, and the model gets one corrective retry

#### Scenario: Instances under a row resolved in the same answer
- **WHEN** the model calls `resolve_document(document_id: R, resolution: "required", …)` and two `add_instance(anchor_document_id: R, …)` calls
- **THEN** the decision has one resolution of R with two instances, and no separate addition

### Requirement: A follow-up answer carries one WhatsApp message and no channel choice
There SHALL be no channel tool or email tool. A `follow_up` answer SHALL carry exactly one WhatsApp message: `send_whatsapp_text` (allowed only while the 24-hour window is open) or `send_whatsapp_template`. The code SHALL derive the channel and the message kind from which tool was called. The planner prompt SHALL NOT ask the model to choose a channel and SHALL NOT describe the email channel as an option.

#### Scenario: Template message outside the window
- **WHEN** the planner answers `follow_up` with `send_whatsapp_template` naming an approved template with the right number of variables, and the window is closed
- **THEN** the gate accepts the answer and the scheduled draft is a WhatsApp template message rendered from that template

#### Scenario: Free text outside the window
- **WHEN** the planner answers `follow_up` with `send_whatsapp_text` and the window is closed
- **THEN** the gate rejects the answer with a note that only a template may be sent outside the window

### Requirement: Every tool stays flat and every provider accepts the set
Each tool's parameter schema SHALL contain zero nullable parameters, zero optional parameters, and no object or list-of-objects parameter. A unit test SHALL assert these three facts on the real tool set of every offered context and SHALL fail when a tool breaks them. The full tool set for a capital-declaration client without a fetch offer SHALL be accepted by the Anthropic structured-output compiler (no "grammar too large" refusal) and by OpenAI strict mode; this SHALL be verified once against the live Anthropic API before the change is archived and recorded in the change's tasks.

#### Scenario: A developer nests a parameter
- **WHEN** a tool gains a parameter whose type is an object or a list of objects
- **THEN** the shape test fails and names the tool and the parameter

#### Scenario: A developer adds a nullable parameter
- **WHEN** a tool gains a parameter that admits null or may be omitted
- **THEN** the shape test fails and names the tool and the parameter

### Requirement: The corrective retry quotes the rejected calls
When the `validate_message` gate rejects an answer, the one corrective retry SHALL append to the request the rejected calls (tool names and parameters as JSON) and the rejection note, and SHALL keep the forced tool answer, so the model corrects the calls instead of the shape.

#### Scenario: Rejected answer is retried
- **WHEN** the first answer is rejected because `send_at` is in the past
- **THEN** the second request ends with the rejected calls and the note, and its answer is again tool calls

### Requirement: The trace shows tools and calls
An LLM call record of this stage SHALL store the offered tools in the request and the list of calls (tool name and parameters) as the response. The admin call modal SHALL show the tool list where it shows the response schema for other stages, and SHALL show each call with its name and parameters. The `#/llm-stages` page SHALL list the stage's tools and their parameters instead of one response schema.

#### Scenario: Admin opens a planner call
- **WHEN** an admin opens the LLM call modal of a `generate_message` call made after this change
- **THEN** the request pane lists the offered tools and the response pane lists the calls the model made, each with its parameters

#### Scenario: Old call records
- **WHEN** an admin opens a `generate_message` call recorded before this change
- **THEN** the modal still shows its response schema and its JSON answer as before
