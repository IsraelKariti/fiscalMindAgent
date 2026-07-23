-- Move agent mailboxes from the root domain to agents.fiscalmind.app.
--
-- The root domain's MX records now belong to Google Workspace (human mail:
-- admin@fiscalmind.app), so Resend no longer receives anything sent to
-- @fiscalmind.app and client replies never reach the app. Agent mail moves to
-- a subdomain whose MX points at Resend; Workspace keeps the root domain.
--
-- Deploy together with the AGENT_EMAIL_DOMAIN=agents.fiscalmind.app env change
-- (the code builds and matches addresses from that variable; these stored rows
-- are the only full addresses in the database). Local parts are unique across
-- the table, so rebuilding addresses from them cannot collide.

UPDATE agent_mailboxes
SET email_address = local_part || '@agents.fiscalmind.app'
WHERE email_address LIKE '%@fiscalmind.app';
