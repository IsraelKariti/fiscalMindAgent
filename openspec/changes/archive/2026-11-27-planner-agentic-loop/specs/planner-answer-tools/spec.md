## ADDED Requirements

### Requirement: A file tie is verified before the model continues
When an accepted `tie_file`, `mark_collected` with a proving file, or `add_instance` with accepted `file_ids` ties a file to a row, the system SHALL verify that document before answering the call, inside the same planner run and under the same client lock, and SHALL return the verdict as the call's result: approved (with the facts the check read that matter for the reply, such as the balance and the as-of date); rejected, with every failure reason in Hebrew and the row reopened; claimed (no file, waits for the accountant); or could not verify (error or kill switch), in which case the result SHALL say the file is received and not yet checked. Several ties of one turn SHALL be verified together as one batch and each call answered with its own verdict. The reply the model then writes SHALL report a rejected file as rejected with its reason and SHALL NOT describe it as received or still being checked.

#### Scenario: Approved
- **WHEN** the model ties a study-fund report and the check approves it
- **THEN** the result says the document is approved and gives the balance and date it read, and the reply confirms it

#### Scenario: Rejected
- **WHEN** the model ties a bank certificate whose as-of date is not 31.12 of the declaration year
- **THEN** the result says the document was rejected and gives the as-of date reason, the row is pending again, and the reply asks for a corrected document with that reason

#### Scenario: Check could not run
- **WHEN** the verification of a tied file throws an error
- **THEN** the result says the file was received and could not be checked yet, the error is logged, and the run goes on to the message

### Requirement: The turn cap
A planner run SHALL make at most 12 model turns. When the cap is reached without an accepted terminal call, the run SHALL fail and the failure SHALL be recorded with the calls made.

#### Scenario: Cap reached
- **WHEN** a model makes 12 turns of checklist calls and never sends
- **THEN** the run fails after the twelfth turn, the applied calls stand, and the trace records the failure

## MODIFIED Requirements

### Requirement: The planner answers with tool calls
The `generate_message` stage SHALL offer the model a set of tools and SHALL run a tool loop on every model provider the admin can select for this stage (Gemini, Anthropic, OpenAI): the system sends the prompt; the model answers with zero or more tool calls and optional text; the system judges and executes every call of the turn and sends each call its real result text; the model answers again. The loop SHALL end when a turn contains a terminal call (`send_whatsapp_text`, `send_whatsapp_template`, `goal_complete`, `client_declined`) that was accepted, when a turn contains no call (see "A run ends with exactly one ending"), or when the turn cap is reached. The tool choice SHALL be left to the model (not forced), so a turn may be text only. The calls of all turns, in order, with their results, SHALL form one planner run and one LLM call record with the summed token usage. On Anthropic and Gemini the turn's results SHALL be sent as that provider's tool-result messages; on OpenAI as function-call outputs continuing the previous response. Text the model writes in a turn SHALL be stored on the call record and SHALL NOT be sent to the client.

#### Scenario: A file is tied and answered in one run
- **WHEN** the client sends one file and the model's first turn is `tie_file(F, D)`
- **THEN** the system ties the file, verifies it, answers the call with the verdict text, and the model's next turn calls `send_whatsapp_text` with a reply that reflects the verdict; the run ends there and the trace shows one planner run

#### Scenario: Several calls in one turn on Anthropic
- **WHEN** an Anthropic model answers one turn with `set_required(...)`, `tie_file(F1, D1)` and `tie_file(F2, D2)`
- **THEN** the system executes the three calls in that turn, verifies both files, and returns three results in one tool-result message before the model's next turn

#### Scenario: One call per turn on OpenAI
- **WHEN** an OpenAI reasoning model answers `tie_file(F, D)` alone, then `send_whatsapp_text(...)` alone
- **THEN** the first turn's result is the verdict of F, the second turn ends the run, and the two turns form one call record with two turns

#### Scenario: OpenAI reaches conclude on a later turn
- **WHEN** an OpenAI model answers the first turn with set_required only, the second turn with tie_file only and the third turn with send_whatsapp_text
- **THEN** each turn is answered with its calls real results (the resolution outcome, then the verdict), the third turn ends the run, and the three turns form one planner run

#### Scenario: OpenAI never concludes
- **WHEN** an OpenAI model makes twelve turns and none of them is an accepted terminal call
- **THEN** the system stops asking, the run fails, and the failure is recorded with the calls made

#### Scenario: Follow-up answer with a message
- **WHEN** the model answers with the single call send_whatsapp_text(text, send_at: "asap", reasoning)
- **THEN** the call is accepted, the stored draft is a WhatsApp free-form message with that text sent as soon as possible, and the run ends

#### Scenario: Collecting answer in one turn
- **WHEN** the model answers one turn with tie_file(F, D) and set_required(R, not_required, quote) and no message
- **THEN** both calls are applied in that turn, the tie is verified and its verdict returned with the resolution outcome, and the model writes the message in its next turn

#### Scenario: Model answers in text only
- **WHEN** the model returns no tool call and no terminal call was accepted yet
- **THEN** the system sends one corrective turn naming the four terminal tools; a second text-only turn fails the run

### Requirement: The tool set and its parameters
The tools offered SHALL be exactly these, with these parameters; every parameter SHALL be required; "none" SHALL be the empty value of the parameter's type (an empty string for text, an empty list for a list, `0` for a number); no parameter SHALL admit null and no parameter SHALL be a list of objects or an object inside an object. There SHALL be no `conclude` tool and no decision label.

- `send_whatsapp_text(text, send_at, reasoning)`: a free-form WhatsApp message, its send time (`"YYYY-MM-DD HH:MM"` in the accountant's timezone, or `asap`) and a short reasoning. Terminal.
- `send_whatsapp_template(template_id, variables, send_at, reasoning)`: an approved template, its variables (list of text), the send time and a short reasoning. Terminal.
- `goal_complete(reasoning)`: every checklist row is settled and the attestation is confirmed; the system sends the fixed closing message. Terminal.
- `client_declined(reasoning)`: the client refused the WhatsApp collection in words; the system sends the fixed acknowledgement. Terminal.
- `mark_collected(document_id)`: a required-document row the client provided without a file in this thread (claimed).
- `tie_file(file_id, document_id, evidence_message_id, evidence_quote)`: a received file is this required document; the evidence pair is empty when code can confirm the match itself. The result is the verification verdict.
- `set_required(document_id, resolution, evidence_message_id, evidence_quote)`: `resolution` one of `required`, `not_required`; the evidence is the client's own words.
- `add_instance(anchor_document_id, name, description, already_provided, file_ids, paper_key, evidence_message_id, evidence_quote, proven_by_file_id)`: one concrete item under a catalog row; `paper_key` one of the catalog papers or empty; exactly one of the evidence pair or `proven_by_file_id` is non-empty. The result names the created row's id; with `file_ids` it also carries each file's verdict.
- `state_cost(document_id, instance_name, amount, currency, evidence_message_id, evidence_quote)`: a purchase cost the client stated in the chat, for an existing item (`document_id` set, `instance_name` empty) or for an item added in the same turn (`document_id` empty, `instance_name` equal to that `add_instance` call's `name`); an item added in an earlier turn is named by the id its result returned.
- `state_vehicle`, `retire_document`, `set_company`, `attestation(action, evidence_message_id, evidence_quote)`, `ask_team(question, reason)`, `document_fetch(action, provider, document_keys)`: parameters unchanged.

#### Scenario: Cost of a new item in the same turn
- **WHEN** the model calls `add_instance(anchor_document_id: R, name: "דירה ברחוב הרצל", ..., paper_key: "cost_declaration")` and `state_cost(document_id: "", instance_name: "דירה ברחוב הרצל", ...)` in the same turn
- **THEN** the item is created with that stated cost, as before

#### Scenario: Cost of an item added in an earlier turn
- **WHEN** an earlier turn's `add_instance` result returned the new row's id N and a later turn calls `state_cost(document_id: N, instance_name: "", ...)`
- **THEN** the cost is stated on row N

#### Scenario: Conclude is called
- **WHEN** the model calls a tool named `conclude`
- **THEN** the call fails the `tool_calls` check and its result says the tool does not exist and names the four terminal tools

#### Scenario: Cost of a new item in the same answer
- **WHEN** the model calls add_instance and state_cost for the same new item in one turn, naming it by instance_name
- **THEN** the item is created with that stated cost, as it was in one answer before this change

#### Scenario: Stated cost names an unknown item
- **WHEN** the model calls state_cost with an empty document_id and an instance_name that no add_instance call of the same turn uses
- **THEN** the call is refused with a result naming the instance name and saying that an item added in an earlier turn is named by the id its result returned

#### Scenario: Empty value instead of null
- **WHEN** the model calls tie_file with an empty evidence_message_id and an empty evidence_quote for a file whose company code confirms
- **THEN** the call is read as "no evidence given" and the match is accepted on code evidence alone

### Requirement: Only the tools this call can use are offered
Before each planner run the system SHALL build the tool set from the full set minus the tools the client cannot use: the checklist tools (`set_required`, `add_instance`, `state_cost`, `state_vehicle`, `retire_document`, `set_company`, `attestation`) when the agent has no intake; `document_fetch` when no fetch provider is offered. The four terminal tools, `mark_collected`, `tie_file` and `ask_team` SHALL always be offered. There SHALL be no reduced set for a run after a verification batch. A call naming a tool that was not offered SHALL fail the `tool_calls` check and SHALL be answered with a result saying so.

#### Scenario: Run after a fetch delivery
- **WHEN** the planner runs after a website fetch delivered and verified documents
- **THEN** the request carries `tie_file` and `mark_collected` like any other run, and the VERIFICATION RESULTS section of the prompt lists the fetched documents' verdicts

#### Scenario: Capital declaration without a fetch offer
- **WHEN** the planner runs for a capital-declaration client to whom no fetch provider is offered
- **THEN** the request carries every tool except document_fetch

#### Scenario: After-verification cycle
- **WHEN** the planner runs after a fetch-delivery batch was verified
- **THEN** the request carries the same tool set as any other run, including mark_collected and tie_file

### Requirement: Calls are assembled into one decision before the business rules
The system SHALL judge every call of a turn against the rules that apply to that call alone (offered tool and parameter shape, evidence quotes from stored inbound messages, instance caps and paper checks, the window and template rules, the attestation gate, the open team question, the live checklist state) and SHALL execute an accepted call at once, before the model's next turn. The result text returned to the model SHALL say what happened in plain words: for a checklist change, the rows created, changed or retired with their ids and names, or why nothing changed; for a tie or collection, the verdict (see the next requirement); for a message, that it is scheduled and for when; for a refused call, that it was refused and the reason, in the same words the gate note uses. Within one turn the system SHALL execute the calls in the fixed safe order (checklist changes, attestation confirmation, ties and collections, team question, terminal call) and SHALL return every call its own result. A refused call SHALL NOT end the run and SHALL NOT undo the other calls of its turn.

#### Scenario: Tie refused for a company mismatch
- **WHEN** the model calls `tie_file(F, D)` and the file's company differs from the row's company
- **THEN** the call is refused, its result says the companies differ and names both, nothing is tied, and the model's next turn may ask the client or tie another row

#### Scenario: Free text outside the window
- **WHEN** the window is closed and the model calls `send_whatsapp_text`
- **THEN** the call is refused with a result saying only a template may be sent outside the window, the run does not end, and the model's next turn may call `send_whatsapp_template`

#### Scenario: Attestation request too early
- **WHEN** the model calls `attestation(action: "request")` while a row is still pending
- **THEN** the call is refused with a result naming the pending row, and the run goes on

#### Scenario: Two conclude calls
- **WHEN** the model calls a tool named conclude, once or twice
- **THEN** each such call fails the tool_calls check and is answered with a result saying the tool does not exist and naming the four terminal tools

#### Scenario: Follow-up without a message
- **WHEN** a turn resolves a row and makes no terminal call
- **THEN** the resolution is applied and answered, no message is scheduled, and the run continues to the next turn

#### Scenario: Both message tools called
- **WHEN** the model calls send_whatsapp_text and send_whatsapp_template in the same turn
- **THEN** the first in execution order is accepted and ends the run, and the second is refused with a result saying one message per run

#### Scenario: Instances under a row resolved in the same answer
- **WHEN** the model calls set_required(R, required, quote) and two add_instance(anchor_document_id: R) calls in one turn
- **THEN** the resolution runs first, the two instances are created under R, and each call is answered with the row ids it created

### Requirement: A follow-up answer carries one WhatsApp message and no channel choice
There SHALL be no channel tool or email tool; the code derives the channel (always WhatsApp) and the message kind from which send tool was called, and the planner prompt SHALL NOT describe the email channel. A planner run SHALL end with exactly one accepted terminal call: one message (`send_whatsapp_text` or `send_whatsapp_template`), or `goal_complete`, or `client_declined`. After an accepted terminal call the loop stops; any further call in the same turn SHALL be refused and recorded. A second message call in the same turn SHALL be refused with a result saying one message per run. When a turn contains no call and no terminal call was accepted yet, the system SHALL send the model one corrective turn stating that the run has no ending yet, that its text is not sent to the client, and naming the four terminal tools; if the next turn still ends without an accepted terminal call, the run SHALL fail and the failure SHALL be recorded. `goal_complete` SHALL be accepted only when every row is settled and the attestation is confirmed (otherwise refused with the reason, as the premature decision was). `client_declined` SHALL be refused when the same run already tied a file, changed the checklist or scheduled a message.

#### Scenario: Message written as text
- **WHEN** the model's turn is text only, holding what looks like the WhatsApp message, and no terminal call was accepted
- **THEN** the system answers with the corrective turn, and the model's next turn calls `send_whatsapp_text` with that text

#### Scenario: Two text-only turns
- **WHEN** the model answers text only twice in a row
- **THEN** the run fails, the `validate_message` row of the last turn has `ending` failed, and no message is scheduled

#### Scenario: Goal complete too early
- **WHEN** the model calls `goal_complete` while the attestation is not confirmed
- **THEN** the call is refused with a result saying the attestation is not confirmed, and the run goes on

#### Scenario: Template message outside the window
- **WHEN** the window is closed and the model calls send_whatsapp_template naming an approved template with the right number of variables
- **THEN** the call is accepted, the scheduled draft is a WhatsApp template message rendered from that template, and the run ends

#### Scenario: Free text outside the window
- **WHEN** the window is closed and the model calls send_whatsapp_text
- **THEN** the call is refused with a result saying only a template may be sent outside the window, and the run goes on

### Requirement: The corrective retry quotes the rejected calls
There SHALL be no whole-answer retry: a refused call is answered with its refusal and the model corrects it in its next turn. The only corrective turn is the one of "A run ends with exactly one ending", and it SHALL quote nothing but the ending rule.

#### Scenario: Refused call corrected next turn
- **WHEN** `send_whatsapp_text` is refused because `send_at` is in the past
- **THEN** the result says so, and the model's next turn calls `send_whatsapp_text` again with a future time or `asap`

#### Scenario: Rejected answer is retried
- **WHEN** a turn is text only and no terminal call was accepted yet
- **THEN** the next request carries one user turn stating the ending rule and naming the four terminal tools, and the model answers again with the same tools offered

### Requirement: The trace shows tools and calls
An LLM call record of this stage SHALL store the offered tools and the loop rule (the terminal tools and the turn cap) in the request, and as the response the list of calls, each with its tool name, parameters, the turn that made it and the result text it was answered with, plus the text the model wrote per turn. The admin call modal SHALL show the tool list where it shows the response schema for other stages, SHALL state the loop rule, SHALL show each call with its name, parameters and result, and SHALL show the number of turns with a "turn N of M" mark on every call. The `#/llm-stages` page SHALL list the stage's tools and state the loop rule.

#### Scenario: Admin opens a run of three turns
- **WHEN** an admin opens the call modal of a planner run that tied a file, then asked the team, then sent
- **THEN** the modal shows three turns, each call with "turn N of 3", and under the `tie_file` call the verdict text the model was given

#### Scenario: Old call records
- **WHEN** an admin opens a planner call recorded before this change
- **THEN** the modal still shows its calls with the `conclude` call and no results, as before

#### Scenario: Admin opens a continued OpenAI call
- **WHEN** an admin opens the LLM call modal of a planner run that an OpenAI model answered in three turns
- **THEN** the calls heading says three turns, each call carries "turn N of 3" and its result text, and the request pane states the loop rule: the run ends on a terminal tool, twelve turns at most

#### Scenario: Admin opens a planner call
- **WHEN** an admin opens the LLM call modal of a planner run made after this change
- **THEN** the request pane lists the offered tools and the response pane lists the calls the model made, each with its parameters and the result it was given
