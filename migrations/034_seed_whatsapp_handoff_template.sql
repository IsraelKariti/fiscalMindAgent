-- Seed the approved "whatsapp_handoff" WhatsApp Content Template: a light,
-- general email→WhatsApp channel-handoff opener the doc collector uses to
-- move a conversation to WhatsApp when the 24h window is closed (e.g. the
-- 106-fetch OTP step). Approved by Meta 2026-07-25 (category: Marketing —
-- their classifier's call; approved and sendable). The SID lives in the
-- platform's single Twilio account, shared by dev and prod, so seeding it
-- here is safe for both. Idempotent: content_sid is UNIQUE.
INSERT INTO wa_templates (content_sid, name, body, variable_count)
VALUES (
  'HX352a2ed4aa2369116e2843fcf9c92ae5',
  'whatsapp_handoff',
  'היי {{1}} 🙂 בהמשך לשיחה שלנו במייל — נמשיך כאן בוואטסאפ, זה יהיה נוח ומהיר יותר. כשנוח לך להמשיך, פשוט השב/י לי כאן ונתקדם.',
  1
)
ON CONFLICT (content_sid) DO NOTHING;
