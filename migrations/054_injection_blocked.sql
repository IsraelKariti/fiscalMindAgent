-- Three injection layers on every untrusted input (regex → dedicated LLM scan
-- → code check of the scan's proof). A hit on an inbound message withholds it
-- from the planner; a hit on an attached file quarantines it before
-- classification. Both record what fired:
--   {detector: 'regex'|'llm', kind: <pattern>|null, evidence: <quote>|null}
ALTER TABLE emails ADD COLUMN blocked JSONB;
ALTER TABLE document_files ADD COLUMN blocked JSONB;
-- document_files.analysis_status gains the value 'blocked' (TEXT, no CHECK).
