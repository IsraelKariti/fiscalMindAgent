## Purpose
Which approved WhatsApp template the agent may send to a client when the 24-hour window is closed, how templates are registered with a purpose, and what happens when no template fits the client's situation.

## ADDED Requirements

### Requirement: The platform's intro template offers a decline button
The declaration-of-capital agent SHALL have exactly one `intro` template, `capital_declaration_intro_v2`, with three variables (client first name, accountant office name, declaration year), present in every database (seeded, not registered by hand). Its text SHALL greet the client as the office's digital assistant, thank them for the questionnaire for the capital declaration as of 31.12 of the year, say that the next step is collecting the documents and that it can be done here on WhatsApp with the assistant's guidance, state that a client who prefers not to must contact the office themselves and hand over every required document directly, and ask how the client prefers. It SHALL carry two quick-reply buttons: "נתחיל כאן בוואטסאפ" and "לא, אטפל בזה בעצמי". The former intro template, `capital_declaration_intro`, SHALL NOT exist in any database after this change, so the planner is never offered it.

#### Scenario: First contact goes out as the v2 intro
- **WHEN** a never-contacted client's first message is planned
- **THEN** the only template offered is `capital_declaration_intro_v2` and the first message is sent as it, with the two buttons

#### Scenario: Old intro gone
- **WHEN** an admin lists the registered templates after the deploy
- **THEN** `capital_declaration_intro` is absent and `capital_declaration_intro_v2` is listed with purpose `intro`

#### Scenario: Timeline shows the body
- **WHEN** the accountant opens the timeline of a client whose v2 intro was sent
- **THEN** the message bubble shows the rendered body text with the client's name, the office name and the year filled in
