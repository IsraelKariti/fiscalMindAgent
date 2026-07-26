-- Multi-provider document fetch: a client can now have one in-flight fetch PER
-- provider (e.g. a Form 106 fetch from the tax authority AND an Altshuler Shaham
-- pension-report fetch), rather than one across the whole client. The old
-- one-active-per-client partial unique index is replaced by one scoped to
-- (client_id, provider). No data migration needed: the old index already
-- guaranteed at most one active row per client, so every client has at most one
-- active row per provider today.
DROP INDEX IF EXISTS tax_fetch_sessions_one_active;
CREATE UNIQUE INDEX tax_fetch_sessions_one_active_per_provider
  ON tax_fetch_sessions (client_id, provider)
  WHERE status IN ('offered','agreed','wa_intro_sent','logging_in','awaiting_otp','verifying','downloading');
