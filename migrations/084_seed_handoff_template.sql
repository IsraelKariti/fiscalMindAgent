-- Handoff template (openspec `whatsapp-templates`, change handoff-notice-to-client).
--
-- finish_conversation was created by the owner in the Twilio Content Template
-- Builder on 2026-11-28 (content type: text, Hebrew, category: Utility,
-- 3 variables: client first name, tax advisor name, tax advisor email, no
-- buttons) on the platform's single Twilio account shared by dev and prod, so
-- seeding the SID here is safe for both. Body copied verbatim from Twilio.
--
-- Meta's approval was still pending when this was written. Until it is
-- approved the provider refuses the send, the notice job gives the claim back
-- and tries again on the next business morning (openspec `handoff-notice`).
-- Idempotent: content_sid is UNIQUE.

INSERT INTO wa_templates (content_sid, name, body, variable_count, agent_type, purpose)
VALUES (
  'HXf24253b8b72a3f92849eb34d05a28a1e',
  'finish_conversation',
  $txt$שלום {{1}},
תקופת איסוף המסמכים להצהרת ההון כאן בוואטסאפ הסתיימה, והשיחה כאן נסגרה.
המסמכים שהתקבלו מועברים להמשך טיפול אצל יועץ/ת המס {{2}}.
לשאלות או להעברת מסמכים נוספים אפשר לפנות במייל {{3}}.
תודה רבה על שיתוף הפעולה!$txt$,
  3,
  'declaration_of_capital',
  'handoff'
)
ON CONFLICT (content_sid) DO NOTHING;
