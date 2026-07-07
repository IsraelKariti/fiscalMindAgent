-- Account tiers. Every accountant is either 'normal' or 'premium'; the admin
-- picks the tier when whitelisting the accountant (default 'normal'). The tier
-- lives on the whitelist entry — the accountant's access record — so it exists
-- before the user's first sign-in.
ALTER TABLE whitelisted_emails
  ADD COLUMN tier TEXT NOT NULL DEFAULT 'normal'
  CHECK (tier IN ('normal', 'premium'));
