-- LLM stage purposes renamed to the sibling agent's canonical names
-- (docs/agents.md "Code gates and the three injection layers"):
--   injection_screen    -> injection_detection_llm
--   form_intake         -> questionnaire_schema_mapping
--   conversation_decide -> generate_message
--   analyze_file        -> file_classification
--   verify_document     -> extract_document
-- The name is stored in two places: the per-purpose model setting key
-- (app_settings 'llm_model:<purpose>', modelSettings.ts) and every
-- llm_calls.purpose row. audit_events is append-only (its trigger refuses
-- UPDATE) and never stored a purpose, so nothing to do there.

UPDATE app_settings SET key = 'llm_model:injection_detection_llm'      WHERE key = 'llm_model:injection_screen';
UPDATE app_settings SET key = 'llm_model:questionnaire_schema_mapping' WHERE key = 'llm_model:form_intake';
UPDATE app_settings SET key = 'llm_model:generate_message'             WHERE key = 'llm_model:conversation_decide';
UPDATE app_settings SET key = 'llm_model:file_classification'          WHERE key = 'llm_model:analyze_file';
UPDATE app_settings SET key = 'llm_model:extract_document'             WHERE key = 'llm_model:verify_document';

UPDATE llm_calls SET purpose = 'injection_detection_llm'      WHERE purpose = 'injection_screen';
UPDATE llm_calls SET purpose = 'questionnaire_schema_mapping' WHERE purpose = 'form_intake';
UPDATE llm_calls SET purpose = 'generate_message'             WHERE purpose = 'conversation_decide';
UPDATE llm_calls SET purpose = 'file_classification'          WHERE purpose = 'analyze_file';
UPDATE llm_calls SET purpose = 'extract_document'             WHERE purpose = 'verify_document';
