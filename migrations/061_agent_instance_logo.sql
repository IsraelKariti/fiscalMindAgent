-- Per-agent-instance profile picture (the WhatsApp sender picture). Admin-owned,
-- like tax_year, so it is a column rather than part of the accountant-editable
-- settings JSONB. Holds the blob key of the uploaded image
-- (logos/<32 random hex>.<png|jpg>, src/storage/logos.ts); NULL = no own icon,
-- the instance falls back to the admin-uploaded app logo (app_settings key
-- app_logo_blob_key) and then to the built-in web/public/petal-seal.png.
ALTER TABLE agent_instances ADD COLUMN logo_blob_key text;
