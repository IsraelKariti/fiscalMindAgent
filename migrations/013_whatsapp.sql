-- WhatsApp as a second channel (via Twilio). One WhatsApp sender number per
-- accountant, mirroring agent_mailboxes; messages share the emails table with
-- a channel discriminator.

-- Per-accountant WhatsApp sender. Numbers are registered as WhatsApp senders
-- in the Twilio console; an admin assigns them to accountants here.
CREATE TABLE wa_senders (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  -- E.164, e.g. +972501234567.
  phone_number TEXT NOT NULL UNIQUE CHECK (phone_number ~ '^\+[1-9][0-9]{6,14}$'),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pre-approved Twilio Content Templates (category "utility"), platform-global.
-- Outside the 24h customer-service window these are the only sendable messages.
CREATE TABLE wa_templates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Twilio Content SID (HX...).
  content_sid    TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  -- Template text with {{1}}..{{n}} variable slots, as approved by Meta.
  body           TEXT NOT NULL,
  variable_count INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Client-side opt-in state. wa_phone is validated E.164 (the free-text `phone`
-- column stays as-is); the toggle records who enabled the channel and when.
ALTER TABLE clients
  ADD COLUMN wa_phone        TEXT,
  ADD COLUMN wa_enabled      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN wa_opted_in_at  TIMESTAMPTZ,
  ADD COLUMN wa_opted_in_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN wa_opted_out_at TIMESTAMPTZ;
-- Inbound routing: sender number -> accountant, then From-number -> that
-- accountant's client. Must be unique per accountant.
CREATE UNIQUE INDEX clients_user_id_wa_phone_key ON clients (user_id, wa_phone) WHERE wa_phone IS NOT NULL;

-- Channel discriminator on messages. WhatsApp rows: subject = '', message_id =
-- Twilio MessageSid (globally unique, so the existing dedupe works), resend_id
-- NULL. Template drafts carry the Content SID + variables until sent.
ALTER TABLE emails
  ADD COLUMN channel              TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'whatsapp')),
  ADD COLUMN wa_content_sid       TEXT,
  ADD COLUMN wa_content_variables JSONB;

-- WhatsApp media lands here too; the dedupe key is provider-neutral now
-- (Resend attachment id or Twilio MessageSid-index).
ALTER TABLE document_files RENAME COLUMN resend_attachment_id TO provider_attachment_id;
