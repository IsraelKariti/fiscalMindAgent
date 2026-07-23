-- The drafted message that carries the 106-fetch offer to the client. The
-- session is created at draft time, but the offer only truly "happened" once
-- that message is sent — if the draft is superseded (regenerate, client reply
-- triggering a re-plan) before sending, the client never saw the offer and the
-- session must not keep suppressing a fresh one. loadTaxFetchContext checks
-- this link lazily and cancels orphaned 'offered' sessions.
ALTER TABLE tax_fetch_sessions
  ADD COLUMN offer_email_id UUID REFERENCES emails(id) ON DELETE SET NULL;
