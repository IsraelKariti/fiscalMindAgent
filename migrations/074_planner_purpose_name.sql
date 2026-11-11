-- LLM stage purpose renamed: generate_message -> planner. The old name was
-- misleading — the planner does not always write a message; often it only
-- calls tools (ties a file, settles a row) and concludes without one.
-- As in 056, the name lives in the per-purpose model setting key
-- (app_settings 'llm_model:<purpose>' and 'llm_backup_model:<purpose>') and in every llm_calls.purpose row.
-- audit_events never stores a purpose.

UPDATE app_settings SET key = 'llm_model:planner'        WHERE key = 'llm_model:generate_message';
UPDATE app_settings SET key = 'llm_backup_model:planner' WHERE key = 'llm_backup_model:generate_message';
UPDATE llm_calls SET purpose = 'planner' WHERE purpose = 'generate_message';
