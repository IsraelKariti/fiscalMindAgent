-- 'superseded' (capital declaration): the document is no longer needed because
-- the office's requirements ladder replaced it with different documents — e.g.
-- a purchase contract + payments appendix the client can't produce, replaced by
-- a purchase-tax assessment + Tabu extract. Distinct from 'not_required' (the
-- asset doesn't exist) so it never reads as "the client doesn't have the asset"
-- in the attestation summary, and rows already collected/approved can be
-- retired without losing their history. Set only by the agent (with evidence)
-- via the superseded_documents planner action; the accountant can reopen to
-- pending from the dashboard.
ALTER TABLE client_documents DROP CONSTRAINT client_documents_status_check;
ALTER TABLE client_documents
  ADD CONSTRAINT client_documents_status_check
  CHECK (status IN ('unresolved', 'not_required', 'pending', 'claimed', 'collected', 'approved', 'superseded'));
