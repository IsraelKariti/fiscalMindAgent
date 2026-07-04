-- Paid-access whitelist. Signing in with Google still creates a users row, but
-- the API (and the dashboard) only open up for emails present here; everyone
-- else sees an "account not activated" screen. Admins (ADMIN_EMAILS) bypass
-- the whitelist and manage it from the admin dashboard. Emails are stored
-- lowercase; an entry may exist before its user ever signs in.
CREATE TABLE whitelisted_emails (
  email       TEXT PRIMARY KEY,
  name        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
