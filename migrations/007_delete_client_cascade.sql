-- Allow deleting a client: 001 created these FKs without ON DELETE, which blocked
-- DELETE FROM clients. client_documents/document_files already cascade (005/006).
ALTER TABLE emails
  DROP CONSTRAINT emails_client_id_fkey,
  ADD CONSTRAINT emails_client_id_fkey
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

ALTER TABLE scheduled_jobs
  DROP CONSTRAINT scheduled_jobs_client_id_fkey,
  ADD CONSTRAINT scheduled_jobs_client_id_fkey
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
