-- Per-accountant WhatsApp Business Account (WABA), connected from the
-- workspace Settings → Integrations tab (Meta Embedded Signup popup, or a
-- manually entered WABA id after sharing it with Twilio in the console).
-- When an accountant has one, admin number provisioning registers their
-- agents' senders under this WABA instead of the platform WABA
-- (TWILIO_WABA_ID) — their own display name, their own messaging limits,
-- and no pressure on the platform WABA's number slots.
CREATE TABLE wa_business_accounts (
  user_id      UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  -- Meta WhatsApp Business Account id (numeric string).
  waba_id      TEXT NOT NULL CHECK (waba_id ~ '^[0-9]{5,20}$'),
  -- How the id got here: the Embedded Signup popup or manual entry.
  source       TEXT NOT NULL CHECK (source IN ('embedded_signup', 'manual')),
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
