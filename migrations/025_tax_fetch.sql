-- Tax-portal login credentials per client, imported from the accountant's
-- monday boards / Google Sheets alongside the rest of the client row (never
-- typed in by the accountant). provider is validated in code, like
-- agent_instances.agent_type. Stored plaintext — the app has no
-- secret-encryption layer yet (known limitation, same as other stored secrets).
CREATE TABLE client_portal_credentials (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  -- 'israel_tax_authority' today; future browser providers (e.g. Meitav) add ids.
  provider    TEXT NOT NULL,
  -- National ID (ת"ז) — the tax-authority login username.
  id_number   TEXT NOT NULL,
  -- Permanent user code (קוד משתמש קבוע) — the tax-authority login secret.
  user_code   TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, provider)
);

-- One conversational document-fetch attempt, offer through delivery. The flow
-- can span days (email offer -> client agrees -> WhatsApp -> OTP -> download),
-- so the state must survive process restarts; only the live browser page is
-- in-memory (worker), and a lost page moves the row to 'expired'.
CREATE TABLE tax_fetch_sessions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id          UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  provider           TEXT NOT NULL DEFAULT 'israel_tax_authority',
  -- The pending required document this fetch satisfies (marked collected on delivery).
  client_document_id UUID REFERENCES client_documents(id) ON DELETE SET NULL,
  status             TEXT NOT NULL CHECK (status IN
    ('offered','agreed','wa_intro_sent','logging_in','awaiting_otp',
     'verifying','downloading','delivered','failed','expired','cancelled')),
  tax_year           INT NOT NULL,
  otp_attempts       INT NOT NULL DEFAULT 0,
  error              TEXT,
  document_file_id   UUID REFERENCES document_files(id) ON DELETE SET NULL,
  otp_requested_at   TIMESTAMPTZ,
  delivered_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX tax_fetch_sessions_client_idx ON tax_fetch_sessions (client_id, created_at);
-- At most one in-flight fetch per client; terminal rows keep the history.
CREATE UNIQUE INDEX tax_fetch_sessions_one_active ON tax_fetch_sessions (client_id)
  WHERE status IN ('offered','agreed','wa_intro_sent','logging_in','awaiting_otp','verifying','downloading');
