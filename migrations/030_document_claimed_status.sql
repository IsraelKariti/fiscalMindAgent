-- Prompt-injection hardening: 'collected' is now reserved for evidence-backed
-- receipt (a verified file, or the accountant's own click). A client's no-file
-- claim ("delivered by fax / brought to the office") lands as 'claimed' and
-- waits for the accountant to confirm it in the workspace — a persuaded LLM
-- can no longer complete a goal off conversation text alone.
ALTER TABLE client_documents DROP CONSTRAINT client_documents_status_check;
ALTER TABLE client_documents
  ADD CONSTRAINT client_documents_status_check CHECK (status IN ('pending', 'claimed', 'collected'));
