-- Per-accountant monday.com OAuth access token, used for server-side monday
-- API reads (customer_service agent: workdocs + board rows). monday access
-- tokens do not expire, so there is no refresh flow; disconnecting deletes
-- the row. Stored plaintext — the app has no secret-encryption layer yet
-- (known limitation, same as other stored secrets).
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
