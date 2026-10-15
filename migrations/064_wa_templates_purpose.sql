-- Template purpose: which closed-window contact a template is for.
--
-- `intro` = the first contact with a client who never received a message;
-- `reopen` = any later contact outside the 24h window, when the conversation
-- is already in progress. The planner is offered only the templates usable
-- for the client (openspec `whatsapp-templates`), so the intro can never go
-- out twice (prod 2026-10-15: a client who wrote three days earlier got the
-- intro again because it was the only template).
--
-- capital_declaration_update was created in the Twilio Content Template
-- Builder on 2026-10-15 (category: Utility, Hebrew, 2 variables) on the
-- platform's single Twilio account shared by dev and prod, so seeding the SID
-- here is safe for both. Body copied verbatim. Idempotent: content_sid is
-- UNIQUE, the UPDATE re-applies cleanly.

ALTER TABLE wa_templates
  ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'reopen'
  CHECK (purpose IN ('intro', 'reopen'));

UPDATE wa_templates SET purpose = 'intro'
WHERE content_sid = 'HX468694984e38857766a4648638bcd868';

INSERT INTO wa_templates (content_sid, name, body, variable_count, agent_type, purpose)
VALUES (
  'HXc0c20a33ebd77efb1bd004b5b041c9a7',
  'capital_declaration_update',
  $txt$שלום {{1}}, כאן העוזר הדיגיטלי של משרד רואה החשבון {{2}}.
נשמח להמשיך מהנקודה שבה עצרנו באיסוף המסמכים להצהרת ההון.
כשנוח לך — השב לי כאן שאתה מוכן, ונמשיך.$txt$,
  2,
  'declaration_of_capital',
  'reopen'
)
ON CONFLICT (content_sid) DO NOTHING;
