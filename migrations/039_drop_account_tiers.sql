-- Account tiers are gone: every accountant gets the full product. Drops the
-- normal/premium column that migration 014 added to the whitelist entry.
ALTER TABLE whitelisted_emails DROP COLUMN tier;
