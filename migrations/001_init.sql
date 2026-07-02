CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE clients (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  email_address     TEXT NOT NULL UNIQUE,
  goal_status       TEXT NOT NULL DEFAULT 'pending' CHECK (goal_status IN ('pending', 'complete')),
  gmail_thread_id   TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE emails (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         UUID NOT NULL REFERENCES clients(id),
  direction         TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  status            TEXT NOT NULL DEFAULT 'sent',
  gmail_message_id  TEXT UNIQUE,
  gmail_thread_id   TEXT,
  subject           TEXT NOT NULL,
  body              TEXT NOT NULL,
  sent_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT emails_status_valid CHECK (
    (direction = 'outbound' AND status IN ('draft', 'sent')) OR
    (direction = 'inbound'  AND status = 'received')
  )
);
CREATE INDEX emails_client_id_idx ON emails (client_id, sent_at, created_at);

CREATE TABLE scheduled_jobs (
  client_id         UUID PRIMARY KEY REFERENCES clients(id),
  bullmq_job_id     TEXT NOT NULL,
  scheduled_for     TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE gmail_sync_state (
  mailbox_email     TEXT PRIMARY KEY,
  last_history_id   TEXT NOT NULL,
  watch_expiration  TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- schema_migrations is bootstrapped by scripts/migrate.ts itself (CREATE TABLE IF NOT EXISTS)
-- before applying any migration file, so it is not (re)created here.
