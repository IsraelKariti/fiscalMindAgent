-- Admin-first onboarding: the user row is created when an admin activates
-- (whitelists) the accountant, not at first Google sign-in — so agents, their
-- email addresses and WhatsApp numbers can all be configured before the
-- accountant ever logs in. Such "invited" rows have no Google identity yet:
-- google_sub becomes nullable, and the first verified Google login with a
-- matching email claims the row (fills google_sub in). The doc collector is
-- no longer auto-provisioned on first app load — every agent is admin-created.
ALTER TABLE users ALTER COLUMN google_sub DROP NOT NULL;

-- Backfill: whitelisted accountants who have not signed in yet get their
-- invited row now, so the admin panel can configure them immediately.
INSERT INTO users (email, name)
SELECT w.email, w.name
FROM whitelisted_emails w
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE lower(u.email) = w.email);
