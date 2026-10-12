-- Soft-deleted clients (openspec `soft-delete-clients`). Deleting a client no
-- longer removes the row: it is marked with the deletion time and the acting
-- user, and its messages, documents, files, blobs, tax-fetch sessions, LLM
-- calls and audit links all stay. Every lookup that drives work filters on
-- deleted_at IS NULL (src/db/queries/clients.ts); only the admin's view-as
-- surfaces read deleted rows.
ALTER TABLE clients
  ADD COLUMN deleted_at TIMESTAMPTZ,
  ADD COLUMN deleted_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- Identity (email / WhatsApp phone per agent instance) is unique among LIVE
-- clients only: the same person may be added again, as a brand-new client,
-- after the earlier one was deleted. The index names are kept — the insert
-- path's collision retry matches on them.
DROP INDEX clients_instance_email_address_key;
CREATE UNIQUE INDEX clients_instance_email_address_key
  ON clients (agent_instance_id, lower(email_address)) WHERE deleted_at IS NULL;

DROP INDEX clients_instance_wa_phone_key;
CREATE UNIQUE INDEX clients_instance_wa_phone_key
  ON clients (agent_instance_id, wa_phone) WHERE wa_phone IS NOT NULL AND deleted_at IS NULL;

-- The admin's "deleted clients" list of one instance, newest deletion first.
CREATE INDEX clients_instance_deleted_idx
  ON clients (agent_instance_id, deleted_at DESC) WHERE deleted_at IS NOT NULL;
