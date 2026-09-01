-- Scope WhatsApp Content Templates to an agent type and register the
-- declaration-of-capital intro template.
--
-- wa_templates was platform-global: every approved template was offered to
-- every agent's planner, which is how the DoC collector's first contact went
-- out as the doc collector's email->WhatsApp handoff template (the only row).
-- agent_type scopes a template to one agent type; NULL = offered to all.
--
-- capital_declaration_intro was approved by Meta (category: Utility) on the
-- platform's single Twilio account shared by dev and prod, so seeding the SID
-- here is safe for both. Body copied verbatim from the Twilio Content API.
-- Idempotent: content_sid is UNIQUE, the UPDATEs re-apply cleanly.

ALTER TABLE wa_templates ADD COLUMN IF NOT EXISTS agent_type TEXT;

-- The handoff opener is the doc collector's (email->WhatsApp move); the DoC
-- agent is WhatsApp-only and must never send it.
UPDATE wa_templates SET agent_type = 'doc_collector'
WHERE content_sid = 'HX352a2ed4aa2369116e2843fcf9c92ae5';

INSERT INTO wa_templates (content_sid, name, body, variable_count, agent_type)
VALUES (
  'HX468694984e38857766a4648638bcd868',
  'capital_declaration_intro',
  $txt$שלום {{1}}, כאן העוזר הדיגיטלי של משרד רואה החשבון {{2}}.
קיבלנו את השאלון שמילאת עבור הצהרת ההון ליום 31.12.{{3}} — תודה!
השלב הבא הוא איסוף המסמכים הנדרשים להצהרה, ואת רובו נוכל להשלים כאן בוואטסאפ בצורה פשוטה.
כשנוח לך להתחיל — פשוט השב לי כאן בהודעה קצרה.$txt$,
  3,
  'declaration_of_capital'
)
ON CONFLICT (content_sid) DO NOTHING;
