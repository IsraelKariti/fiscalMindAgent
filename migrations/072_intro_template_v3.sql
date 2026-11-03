-- Intro template v3 (openspec `whatsapp-templates`, change intro-template-v3).
--
-- capital_declaration_intro_v3 was created by the owner in the Twilio Content
-- Template Builder and approved by Meta on 2026-11-03 (content type:
-- quick-reply, Hebrew, category: Utility, 3 variables) on the platform's
-- single Twilio account shared by dev and prod, so seeding the SID here is
-- safe for both. Body copied verbatim. The two quick-reply buttons are not
-- part of the body:
--   "נאסוף כאן בווצאפ"     (id: start)
--   "העברה ישירות למשרד"   (id: decline)
-- A tap arrives as an inbound message whose Body is the button text and whose
-- ButtonPayload is the id; the decline is handled by clientDecline.ts.
--
-- The former intro (capital_declaration_intro_v2, HX9bcbb5536239a542c74a772f4a0e70d3,
-- seeded by 071) is deleted so the planner is never offered it again.
-- Idempotent: content_sid is UNIQUE, the DELETE re-applies.

INSERT INTO wa_templates (content_sid, name, body, variable_count, agent_type, purpose)
VALUES (
  'HXb58466a274518ac48b8092d6cb82477f',
  'capital_declaration_intro_v3',
  $txt$שלום {{1}},
כאן העוזר הדיגיטלי של משרד רואה החשבון {{2}}.
קיבלנו את השאלון שמילאת עבור הצהרת ההון ליום 31.12.{{3}} – תודה!
השלב הבא הוא ריכוז המסמכים הנדרשים. כדי לחסוך לך זמן, נוכל לעשות זאת יחד כאן בוואטסאפ בצורה מאובטחת, צעד אחר צעד ובקצב שלך.
מעדיף/ה להעביר את המסמכים ישירות לצוות המשרד? אין בעיה, אנחנו לשירותך בכל דרך שנוחה לך.$txt$,
  3,
  'declaration_of_capital',
  'intro'
)
ON CONFLICT (content_sid) DO NOTHING;

DELETE FROM wa_templates WHERE content_sid = 'HX9bcbb5536239a542c74a772f4a0e70d3';
