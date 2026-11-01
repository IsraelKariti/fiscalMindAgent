-- Intro template v2 with a decline button (openspec `whatsapp-templates`,
-- change intro-template-decline).
--
-- capital_declaration_intro_v2 was created by the owner in the Twilio Content
-- Template Builder on 2026-11-01 (content type: quick-reply, Hebrew,
-- category: Utility, 3 variables) on the platform's single Twilio account
-- shared by dev and prod, so seeding the SID here is safe for both. Body
-- copied verbatim. The two quick-reply buttons are not part of the body:
--   "נתחיל כאן בוואטסאפ"   (id: start)
--   "לא, אטפל בזה בעצמי"   (id: decline)
-- A tap arrives as an inbound message whose Body is the button text and whose
-- ButtonPayload is the id; the decline is handled by clientDecline.ts.
--
-- The former intro (capital_declaration_intro, HX468694984e38857766a4648638bcd868,
-- seeded by 051 with ON CONFLICT DO NOTHING) is deleted so the planner is never
-- offered it again. Idempotent: content_sid is UNIQUE, the DELETE re-applies.

INSERT INTO wa_templates (content_sid, name, body, variable_count, agent_type, purpose)
VALUES (
  'HX9bcbb5536239a542c74a772f4a0e70d3',
  'capital_declaration_intro_v2',
  $txt$שלום {{1}}, כאן העוזר הדיגיטלי של משרד רואה החשבון {{2}}.
קיבלנו את השאלון שמילאת עבור הצהרת ההון ליום 31.12.{{3}} — תודה!
השלב הבא הוא איסוף המסמכים הנדרשים להצהרה. אפשר לעשות את זה כאן בוואטסאפ, בליווי שלי, צעד אחר צעד.
אם תעדיף/י שלא, תצטרך/י ליצור קשר עם המשרד בעצמך ולהעביר אליו את כל המסמכים הנדרשים ישירות.
איך נוח לך?$txt$,
  3,
  'declaration_of_capital',
  'intro'
)
ON CONFLICT (content_sid) DO NOTHING;

DELETE FROM wa_templates WHERE content_sid = 'HX468694984e38857766a4648638bcd868';
