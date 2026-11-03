## MODIFIED Requirements

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
