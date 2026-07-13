-- Daily Gemini token usage per accountant, agent instance and model — the
-- admin spend-analytics time series. The lifetime counters (llm_model_usage)
-- stay authoritative for all-time totals; this table adds the day and agent
-- dimensions, so history starts at deploy time. Days are bucketed in
-- ACCOUNTANT_TIMEZONE (computed by the writer, not the DB clock).
CREATE TABLE llm_usage_daily (
  day               DATE NOT NULL,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- NULL only for legacy CLI-era clients that predate agent_instances
  -- (treated as doc_collector, like clients.agent_instance_id).
  agent_instance_id UUID REFERENCES agent_instances(id) ON DELETE CASCADE,
  model             TEXT NOT NULL,
  input_tokens      BIGINT NOT NULL DEFAULT 0,
  output_tokens     BIGINT NOT NULL DEFAULT 0,
  thinking_tokens   BIGINT NOT NULL DEFAULT 0,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One counter row per (day, user, instance, model). NULLS NOT DISTINCT so the
-- legacy NULL-instance bucket upserts into one row instead of duplicating.
CREATE UNIQUE INDEX llm_usage_daily_key
  ON llm_usage_daily (day, user_id, agent_instance_id, model) NULLS NOT DISTINCT;
