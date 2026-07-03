-- Multi-tenant foundation: dashboard users (Google sign-in), one connected
-- Gmail mailbox per user (encrypted refresh token), user-owned clients, and
-- per-user settings (system-prompt template).

CREATE TABLE users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_sub   TEXT NOT NULL UNIQUE,
  email        TEXT NOT NULL UNIQUE,
  name         TEXT,
  picture_url  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The mailbox the agent sends/receives as, connected via a separate OAuth
-- consent (gmail.send + gmail.readonly). One per user for now (UNIQUE user_id);
-- dropping that constraint is the extension point for multiple mailboxes.
CREATE TABLE gmail_accounts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  email_address      TEXT NOT NULL UNIQUE,
  refresh_token_enc  TEXT NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Clients become user-owned. Pre-existing rows (created via the CLI before
-- multi-tenancy) keep NULL and are not visible to any dashboard user.
ALTER TABLE clients
  ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- A client email only needs to be unique within one user's roster.
ALTER TABLE clients DROP CONSTRAINT clients_email_address_key;
CREATE UNIQUE INDEX clients_user_id_email_address_key ON clients (user_id, email_address);
CREATE INDEX clients_user_id_idx ON clients (user_id);

-- Per-user key/value settings (system-prompt template). Supersedes the global
-- app_settings table, which stays until the prompt-template code is rewired to
-- per-user storage (dropped in a later cleanup migration).
CREATE TABLE user_settings (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key         TEXT NOT NULL,
  value       TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);
