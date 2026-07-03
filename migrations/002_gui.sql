-- GUI support: richer client profile fields + a key/value settings store
-- (used for the editable Gemini system-prompt template).

ALTER TABLE clients
  ADD COLUMN occupation TEXT,
  ADD COLUMN phone      TEXT,
  ADD COLUMN company    TEXT,
  ADD COLUMN notes      TEXT;

CREATE TABLE app_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
