-- Which received file an LLM call read (file_splitting, file_classification,
-- extract_document); NULL for calls that read no single file (generate_message,
-- questionnaire mapping, injection screen) and for rows written before this
-- column existed. Lets the admin trace name the file on the stage chip.
-- No FK and no cascade, like client_id on this table: call history must
-- survive the deletion of what it refers to. No index: the only readers are
-- the per-client lists already served by llm_calls_client_idx.
ALTER TABLE llm_calls ADD COLUMN document_file_id UUID;
