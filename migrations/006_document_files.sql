-- Files received from clients (email attachments). Bytes live in Azure Blob
-- Storage under blob_key; this table is the metadata/system-of-record.

CREATE TABLE document_files (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id            UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  -- Inbound email the file arrived on.
  email_id             UUID REFERENCES emails(id) ON DELETE SET NULL,
  -- Which required document this file satisfies, once matched (by the LLM or manually).
  client_document_id   UUID REFERENCES client_documents(id) ON DELETE SET NULL,
  -- Resend's id for the attachment; dedupes duplicate webhook deliveries.
  resend_attachment_id TEXT NOT NULL UNIQUE,
  blob_key             TEXT NOT NULL UNIQUE,
  filename             TEXT NOT NULL,
  content_type         TEXT NOT NULL,
  size_bytes           BIGINT NOT NULL,
  sha256               TEXT NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX document_files_client_id_idx ON document_files (client_id, created_at);
