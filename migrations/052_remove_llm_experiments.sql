-- The admin LLM A/B experiment (049) is retired: no arms, no per-client
-- variant assignment. The per-call llm_calls observability log stays; its
-- variant attribution column goes with the feature.

ALTER TABLE agent_instances DROP COLUMN llm_experiment;
ALTER TABLE clients DROP COLUMN llm_variant;
ALTER TABLE llm_calls DROP COLUMN variant;
