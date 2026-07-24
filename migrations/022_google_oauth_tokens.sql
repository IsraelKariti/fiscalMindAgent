-- Per-accountant Google OAuth tokens (drive.file scope), used for server-side
-- reads of the specific Google Sheets / Docs the accountant picked as
-- customer_service knowledge sources. Unlike monday tokens, Google access
-- tokens expire (~1h) — the refresh token is the durable credential and the
-- access token is refreshed on demand. Both tokens are encrypted at rest by
-- the app (AES-256-GCM, src/crypto/secretBox.ts); pre-existing rows are
-- backfilled by scripts/encryptSecrets.ts.
CREATE TABLE google_oauth_tokens (
  user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  access_token  TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  -- When access_token stops working; refresh before reads once it's near.
  expires_at    TIMESTAMPTZ NOT NULL,
  -- Space-separated scopes granted at authorize time.
  scopes        TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
