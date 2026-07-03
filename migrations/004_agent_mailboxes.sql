-- Allocated agent mailboxes (<name>@fiscalmind.app via Resend) replace
-- user-connected Gmail accounts. Fresh start: Gmail tables are dropped, not
-- migrated, and threading columns become provider-neutral.

CREATE TABLE agent_mailboxes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  local_part    TEXT NOT NULL UNIQUE
                CHECK (local_part ~ '^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])?$'),
  email_address TEXT NOT NULL UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TABLE gmail_accounts;
DROP TABLE gmail_sync_state;

-- RFC 5322 Message-ID: inbound dedupe key and In-Reply-To/References source.
ALTER TABLE emails RENAME COLUMN gmail_message_id TO message_id;
-- Resend's own id for the email (send response / inbound email_id), kept for
-- re-fetching content and debugging in the Resend dashboard.
ALTER TABLE emails ADD COLUMN resend_id TEXT;
ALTER TABLE emails DROP COLUMN gmail_thread_id;
ALTER TABLE clients DROP COLUMN gmail_thread_id;
