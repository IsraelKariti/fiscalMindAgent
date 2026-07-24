-- Per-accountant monday.com OAuth access token, used for server-side monday
-- API reads (customer_service agent: workdocs + board rows). monday access
-- tokens do not expire, so there is no refresh flow; disconnecting deletes
-- the row. access_token is encrypted at rest by the app (AES-256-GCM,
-- src/crypto/secretBox.ts); pre-existing rows are backfilled by
-- scripts/encryptSecrets.ts.
CREATE TABLE monday_oauth_tokens (
  user_id           UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  access_token      TEXT NOT NULL,
  -- Space-separated scopes granted at authorize time (e.g. 'boards:read docs:read').
  scopes            TEXT NOT NULL DEFAULT '',
  -- monday account the token belongs to (informational, from the token exchange).
  monday_account_id TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
