## Purpose
Which approved WhatsApp template the agent may send to a client when the 24-hour window is closed, how templates are registered with a purpose, and what happens when no template fits the client's situation.

## ADDED Requirements

### Requirement: Every template has a purpose
Every registered WhatsApp template SHALL carry a purpose: `intro` (the first contact with a client who has never received a message) or `reopen` (a later contact outside the 24-hour window, when the conversation is already in progress). Registering a template SHALL accept the purpose and SHALL default it to `reopen`. The platform's `capital_declaration_intro` template SHALL have purpose `intro`. The template listing SHALL show each template's purpose.

#### Scenario: Registering a re-engagement template
- **WHEN** an admin registers an approved template without naming a purpose
- **THEN** the template is stored with purpose `reopen` and the listing shows it as `reopen`

#### Scenario: Registering an intro template
- **WHEN** an admin registers an approved template with purpose `intro`
- **THEN** the template is stored with purpose `intro`

### Requirement: Only the templates usable for this client are offered
When the planner runs for a client whose 24-hour window is closed, it SHALL be offered only the templates usable for that client: `intro` templates while no message has ever been delivered to the client, `reopen` templates once at least one message was delivered. The prompt SHALL state that templates of the other purpose exist but are hidden and why, so the planner does not look for them. The prompt SHALL tell the planner that a `reopen` template only announces that there is an update, and that the first free-form message after the client replies carries the real content.

#### Scenario: Conversation in progress, window closed
- **WHEN** the client received the intro and later wrote, and more than 24 hours have passed since the client's last message
- **THEN** the planner sees only `reopen` templates, the intro is listed as hidden ("already sent"), and the scheduled draft is a `reopen` template

#### Scenario: First contact
- **WHEN** the client has never received any message
- **THEN** the planner sees only `intro` templates and the first message goes out as the intro

#### Scenario: Intro delivered, client never answered
- **WHEN** the client received the intro, never wrote, and the planner runs again
- **THEN** the planner sees only `reopen` templates and the reminder goes out as a `reopen` template, not as the intro again

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
