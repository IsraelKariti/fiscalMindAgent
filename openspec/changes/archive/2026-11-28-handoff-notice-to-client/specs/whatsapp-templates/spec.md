## ADDED Requirements

### Requirement: The platform offers a handoff template
The declaration-of-capital agent SHALL have an approved `handoff` template, `finish_conversation`, with three variables (client first name, tax advisor name, tax advisor email), present in every database (seeded, not registered by hand). Its text SHALL greet the client, say that the document collection for the capital declaration here on WhatsApp has ended and the conversation here is closed, say that the documents received are forwarded to the named tax advisor, give the advisor's email address for questions and further documents, and thank the client for the cooperation. It SHALL carry no buttons and SHALL NOT ask the client to reply.

#### Scenario: Template body
- **WHEN** `finish_conversation` is rendered for client "ישראל", advisor "דנה לוי" and email dana@office.example
- **THEN** the message greets ישראל, says the collection on WhatsApp ended and the conversation is closed, names דנה לוי as the tax advisor who receives the documents, gives dana@office.example, and ends with thanks

#### Scenario: Listed with its purpose
- **WHEN** an admin lists the registered templates after the deploy
- **THEN** `finish_conversation` is listed with purpose `handoff`

## MODIFIED Requirements

### Requirement: Every template has a purpose
Every registered WhatsApp template SHALL carry a purpose: `intro` (the first contact with a client who has never received a message), `reopen` (a later contact outside the 24-hour window, when the conversation is already in progress), or `handoff` (the fixed notice a client receives after the agent stopped at the end of the collection window). Registering a template SHALL accept the purpose and SHALL default it to `reopen`. The platform's `capital_declaration_intro` template SHALL have purpose `intro`. The template listing SHALL show each template's purpose.

#### Scenario: Registering a re-engagement template
- **WHEN** an admin registers an approved template without naming a purpose
- **THEN** the template is stored with purpose `reopen` and the listing shows it as `reopen`

#### Scenario: Registering an intro template
- **WHEN** an admin registers an approved template with purpose `intro`
- **THEN** the template is stored with purpose `intro`

#### Scenario: Registering a handoff template
- **WHEN** an admin registers an approved template with purpose `handoff`
- **THEN** the template is stored with purpose `handoff`

### Requirement: Only the templates usable for this client are offered
When the planner runs for a client whose 24-hour window is closed, it SHALL be offered only the templates usable for that client: `intro` templates while no message has ever been delivered to the client, `reopen` templates once at least one message was delivered. A `handoff` template SHALL never be offered to the planner and SHALL NOT count as a usable template for any client. The prompt SHALL state that templates of the other purpose exist but are hidden and why, so the planner does not look for them. The prompt SHALL tell the planner that a `reopen` template only announces that there is an update, and that the first free-form message after the client replies carries the real content.

#### Scenario: Conversation in progress, window closed
- **WHEN** the client received the intro and later wrote, and more than 24 hours have passed since the client's last message
- **THEN** the planner sees only `reopen` templates, the intro is listed as hidden ("already sent"), and the scheduled draft is a `reopen` template

#### Scenario: First contact
- **WHEN** the client has never received any message
- **THEN** the planner sees only `intro` templates and the first message goes out as the intro

#### Scenario: Intro delivered, client never answered
- **WHEN** the client received the intro, never wrote, and the planner runs again
- **THEN** the planner sees only `reopen` templates and the reminder goes out as a `reopen` template, not as the intro again

#### Scenario: Handoff template never offered
- **WHEN** the planner runs for any client while `finish_conversation` is registered
- **THEN** the template is not among the offered ones, and an answer that names it is rejected like any template of the wrong purpose

#### Scenario: Only a handoff template is registered for the situation
- **WHEN** the window is closed, a message was already delivered to the client, and the registered templates are the intro and the handoff one only
- **THEN** the planner is not called and the recorded reason says that no `reopen` template is registered
