-- monday.com dashboard-widget accounts: maps a monday (account, user) pair to
-- a fiscalMind user. Created either by auto-provisioning on first widget load
-- or by explicitly linking an existing Google-based account; linking re-points
-- user_id, so the pair is the natural key.

CREATE TABLE monday_accounts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  monday_account_id  TEXT NOT NULL,
  monday_user_id     TEXT NOT NULL,
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Email monday reported for the user at provision/link time (display only —
  -- it is claimed by the widget frontend, not verified by Google).
  monday_email       TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (monday_account_id, monday_user_id)
);

CREATE INDEX monday_accounts_user_id_idx ON monday_accounts (user_id);
