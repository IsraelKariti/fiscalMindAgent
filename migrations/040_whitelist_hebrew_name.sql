-- Admin-entered Hebrew display name for the accountant (or their firm).
-- users.name is re-synced from the Google profile on every sign-in, so it is
-- often an English name the agents must not sign client messages with; this
-- column is the admin-controlled Hebrew identity, filled when the account is
-- activated.
ALTER TABLE whitelisted_emails ADD COLUMN hebrew_name TEXT;
