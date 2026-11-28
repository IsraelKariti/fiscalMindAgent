# whatsapp-templates Specification

## Purpose
Which approved WhatsApp template the agent may send to a client when the 24-hour window is closed, how templates are registered with a purpose, and what happens when no template fits the client's situation.

## Requirements

### Requirement: The platform's intro template offers a decline button
The declaration-of-capital agent SHALL have exactly one `intro` template, `capital_declaration_intro_v3`, with three variables (client first name, accountant office name, declaration year), present in every database (seeded, not registered by hand). Its text SHALL greet the client as the office's digital assistant, thank them for the questionnaire for the capital declaration as of 31.12 of the year, say that the next step is gathering the required documents and that, to save the client time, it can be done together here on WhatsApp securely, step by step and at the client's pace, and say that a client who prefers to hand the documents directly to the office team may do so ("no problem"). It SHALL carry two quick-reply buttons: "נאסוף כאן בווצאפ" (id `start`) and "העברה ישירות למשרד" (id `decline`). The former intro templates, `capital_declaration_intro` and `capital_declaration_intro_v2`, SHALL NOT exist in any database after this change, so the planner is never offered them.

#### Scenario: First contact goes out as the v3 intro
- **WHEN** a never-contacted client's first message is planned
- **THEN** the only template offered is `capital_declaration_intro_v3` and the first message is sent as it, with the two buttons

#### Scenario: Old intros gone
- **WHEN** an admin lists the registered templates after the deploy
- **THEN** `capital_declaration_intro` and `capital_declaration_intro_v2` are absent and `capital_declaration_intro_v3` is listed with purpose `intro`

#### Scenario: Timeline shows the body
- **WHEN** the accountant opens the timeline of a client whose v3 intro was sent
- **THEN** the message bubble shows the rendered body text with the client's name, the office name and the year filled in

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

### Requirement: A template of the wrong purpose is rejected
If the planner answers with a template that is not usable for the client, the `validate_message` gate SHALL reject the answer in its `business_rules` check with a note naming the template and the reason (the intro was already delivered to this client / the client has not had the first contact yet), and the planner SHALL get the usual corrective retry.

#### Scenario: Intro chosen after first contact
- **WHEN** a message was already delivered to the client and the planner's answer names the `intro` template
- **THEN** the answer is rejected, the `validate_message` row shows `business_rules` failed with a note saying the intro was already delivered, and no message is scheduled

### Requirement: No usable template means no planner run
When the 24-hour window is closed and no template usable for the client is registered, the planner SHALL NOT run. The cycle SHALL fail loudly as it does today when no template exists at all (drafting failed, manual retry), with a reason that names the missing purpose (`reopen` or `intro`). The planner SHALL NOT be asked to write a message no channel can carry.

#### Scenario: Reopen template not yet registered
- **WHEN** the window is closed, a message was already delivered to the client, and only `intro` templates are registered
- **THEN** the planner is not called, the client shows the drafting-failed state, and the recorded reason says that no `reopen` template is registered

### Requirement: The platform offers a re-engagement template
The declaration-of-capital agent SHALL have an approved `reopen` template, `capital_declaration_update`, with two variables (client first name, accountant office name), present in every database (seeded, not registered by hand). Its text SHALL only greet the client as the office's digital assistant, say that we would like to continue from where we stopped in collecting the documents for the capital declaration, and ask the client to reply here that they are ready so we continue. It SHALL NOT restate the intro, mention the questionnaire, name any document, or claim to have an update.

#### Scenario: Template body
- **WHEN** the planner renders `capital_declaration_update` for client "ישראל" of office "אריה רותם"
- **THEN** the message greets ישראל as the office's digital assistant, says we would like to continue from where we stopped in collecting the documents for the capital declaration, and asks to reply here when ready, and nothing else

### Requirement: The platform offers a handoff template
The declaration-of-capital agent SHALL have an approved `handoff` template, `finish_conversation`, with three variables (client first name, tax advisor name, tax advisor email), present in every database (seeded, not registered by hand). Its text SHALL greet the client, say that the document collection for the capital declaration here on WhatsApp has ended and the conversation here is closed, say that the documents received are forwarded to the named tax advisor, give the advisor's email address for questions and further documents, and thank the client for the cooperation. It SHALL carry no buttons and SHALL NOT ask the client to reply.

#### Scenario: Template body
- **WHEN** `finish_conversation` is rendered for client "ישראל", advisor "דנה לוי" and email dana@office.example
- **THEN** the message greets ישראל, says the collection on WhatsApp ended and the conversation is closed, names דנה לוי as the tax advisor who receives the documents, gives dana@office.example, and ends with thanks

#### Scenario: Listed with its purpose
- **WHEN** an admin lists the registered templates after the deploy
- **THEN** `finish_conversation` is listed with purpose `handoff`
