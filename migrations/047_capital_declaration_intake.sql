-- Capital-declaration intake (declaration_of_capital): every new client's
-- checklist is seeded from the hardcoded document-type catalog as 'unresolved'
-- rows, the intake interview resolves each to not_required / pending (one row
-- per concrete document — two cars are two rows), and a received file must
-- pass the automatic verification pipeline before its row reaches 'approved'.
-- Doc-collector rows keep using pending/claimed/collected only.

-- Which catalog type the row instantiates (src/agents/declarationOfCapital/
-- catalog.ts). NULL for doc-collector rows, ad-hoc additions and all existing
-- rows. No FK — the catalog lives in code; keys are validated at write time.
ALTER TABLE client_documents ADD COLUMN type_key TEXT;

-- The verification pipeline's latest verdict for this row: extracted fields,
-- per-check pass/fail with Hebrew reasons, attempt count, verified file id.
-- Rewritten on every attempt; history lives in audit_events.
ALTER TABLE client_documents ADD COLUMN verification JSONB;

-- The client statement an intake resolution rests on ({message_id, quote}) —
-- mandatory evidence for every agent-made 'not_required', the durable answer
-- to "you never asked me / I never said that".
ALTER TABLE client_documents ADD COLUMN resolution_evidence JSONB;

ALTER TABLE client_documents DROP CONSTRAINT client_documents_status_check;
ALTER TABLE client_documents
  ADD CONSTRAINT client_documents_status_check
  CHECK (status IN ('unresolved', 'not_required', 'pending', 'claimed', 'collected', 'approved'));
