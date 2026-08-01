-- Retire the 'offered' conversational state. Offers now live in message text
-- only — the model reads the thread to know whether it already offered — and a
-- session first exists when the client agrees (client_agreed creates it at
-- wa_intro_sent) or a login starts. Active 'offered' rows lose their meaning:
-- cancel them (client_agreed recreates the session, so nothing is lost). The
-- offer_email_id column existed only for the superseded-unsent-offer check and
-- goes with it.
UPDATE tax_fetch_sessions SET status = 'cancelled', updated_at = now() WHERE status = 'offered';

ALTER TABLE tax_fetch_sessions DROP COLUMN IF EXISTS offer_email_id;

ALTER TABLE tax_fetch_sessions DROP CONSTRAINT tax_fetch_sessions_status_check;
ALTER TABLE tax_fetch_sessions ADD CONSTRAINT tax_fetch_sessions_status_check CHECK (status IN
  ('agreed','wa_intro_sent','logging_in','awaiting_otp',
   'verifying','downloading','delivered','failed','expired','cancelled'));

DROP INDEX IF EXISTS tax_fetch_sessions_one_active_per_provider;
CREATE UNIQUE INDEX tax_fetch_sessions_one_active_per_provider
  ON tax_fetch_sessions (client_id, provider)
  WHERE status IN ('agreed','wa_intro_sent','logging_in','awaiting_otp','verifying','downloading');
