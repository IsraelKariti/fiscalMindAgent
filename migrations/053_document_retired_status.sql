-- Rename the 'superseded' document status to 'retired' (capital declaration,
-- migration 050). Same meaning: the requirements ladder replaced the row with
-- different documents, so it leaves the goal without ever reading as "the
-- client doesn't have the asset". The planner field is now retired_documents,
-- the audit action document.retired, the query clientDocuments.retire.
-- The email review_status 'superseded' (migration 048) is a different thing
-- and is unchanged.
UPDATE client_documents SET status = 'retired' WHERE status = 'superseded';
ALTER TABLE client_documents DROP CONSTRAINT client_documents_status_check;
ALTER TABLE client_documents
  ADD CONSTRAINT client_documents_status_check
  CHECK (status IN ('unresolved', 'not_required', 'pending', 'claimed', 'collected', 'approved', 'retired'));
