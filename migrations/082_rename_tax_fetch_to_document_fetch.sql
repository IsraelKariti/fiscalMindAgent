-- 082: the website fetch is no longer only the tax authority (Harel, Phoenix,
-- Meitav, Menora, Migdal, Altshuler Shaham fetch the same way), so the name
-- tax_fetch becomes document_fetch everywhere: the sessions table with its
-- indexes and constraints, and the two emails columns whose CHECK lists hold
-- the 'tax_fetch' plan trigger / discard reason. audit_events rows keep their
-- recorded names (the table is append-only); the GUI reads both spellings.

ALTER TABLE tax_fetch_sessions RENAME TO document_fetch_sessions;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'document_fetch_sessions'::regclass AND conname LIKE 'tax_fetch_sessions%'
  LOOP
    EXECUTE format('ALTER TABLE document_fetch_sessions RENAME CONSTRAINT %I TO %I',
      r.conname, replace(r.conname, 'tax_fetch_sessions', 'document_fetch_sessions'));
  END LOOP;
  FOR r IN
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'document_fetch_sessions' AND indexname LIKE 'tax_fetch_sessions%'
  LOOP
    EXECUTE format('ALTER INDEX %I RENAME TO %I',
      r.indexname, replace(r.indexname, 'tax_fetch_sessions', 'document_fetch_sessions'));
  END LOOP;
END $$;

ALTER TABLE emails DROP CONSTRAINT emails_plan_trigger_check;
ALTER TABLE emails DROP CONSTRAINT emails_discard_reason_check;
UPDATE emails SET plan_trigger = 'document_fetch' WHERE plan_trigger = 'tax_fetch';
UPDATE emails SET discard_reason = 'document_fetch' WHERE discard_reason = 'tax_fetch';
ALTER TABLE emails ADD CONSTRAINT emails_plan_trigger_check CHECK (plan_trigger IN (
  'client_message', 'agent_message_sent', 'file_verification', 'document_fetch',
  'kickoff', 'team_answer', 'admin_redraft', 'review_regenerate',
  'admin_unpause', 'resume', 'goal_reopened', 'channel_changed'
));
ALTER TABLE emails ADD CONSTRAINT emails_discard_reason_check CHECK (discard_reason IN (
  'client_message', 'file_verification', 'document_fetch', 'admin_redraft',
  'admin_pause', 'resume', 'client_declined', 'goal_changed',
  'channel_changed', 'client_deleted', 'send_settled', 'review_regenerate',
  'unknown'
));
