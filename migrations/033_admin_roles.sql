-- Admin access moves from the ADMIN_EMAILS env allowlist into the database:
-- users.is_admin is the source of truth, managed from the admin panel
-- (grant/revoke go through requireAdmin, so they land in the audit trail).
-- ADMIN_EMAILS remains only as a one-time bootstrap seed (applied while the
-- DB has zero admins), the alert-recipient fallback and the contact address.
ALTER TABLE users ADD COLUMN is_admin boolean NOT NULL DEFAULT false;
