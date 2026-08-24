-- Admin-only LLM A/B experiments for the declaration_of_capital pilot, plus
-- per-call observability for every LLM request.
--
-- llm_experiment is a COLUMN (not a key inside settings) for the same reason
-- as the 048 supervision flags: the accountant's settings PUT replaces the
-- settings object wholesale, and the experiment must be invisible to and
-- untouchable by the accountant. Same for clients.llm_variant.

ALTER TABLE agent_instances ADD COLUMN llm_experiment JSONB;
ALTER TABLE clients ADD COLUMN llm_variant TEXT;

-- Cached (prompt-cache read) tokens join the aggregate counters; they bill at
-- a discounted input rate.
ALTER TABLE llm_model_usage ADD COLUMN cached_tokens BIGINT NOT NULL DEFAULT 0;
ALTER TABLE llm_usage_daily ADD COLUMN cached_tokens BIGINT NOT NULL DEFAULT 0;

-- One row per LLM API call: the exact input sent, the response, token counts
-- by kind, and the per-token USD prices AT CALL TIME (the pricing feed moves,
-- so read-time multiplication cannot reproduce historical spend). Like
-- audit_events, deliberately no FKs: call history must survive client
-- deletion.
CREATE TABLE llm_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id UUID,
  agent_instance_id UUID,
  client_id UUID,
  -- Experiment arm key the call ran under (NULL outside experiments).
  variant TEXT,
  -- What the call was for: 'conversation_decide' | 'form_intake' | 'verify_document' | 'analyze_file' | ...
  purpose TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ok', 'error')),
  error TEXT,
  attempts INT NOT NULL DEFAULT 1,
  duration_ms INT,
  input_tokens BIGINT NOT NULL DEFAULT 0,
  output_tokens BIGINT NOT NULL DEFAULT 0,
  thinking_tokens BIGINT NOT NULL DEFAULT 0,
  -- Subset of input_tokens served from the provider's prompt cache.
  cached_tokens BIGINT NOT NULL DEFAULT 0,
  -- USD per single token at call time; NULL when the pricing feed had no entry.
  input_price_per_token DOUBLE PRECISION,
  output_price_per_token DOUBLE PRECISION,
  thinking_price_per_token DOUBLE PRECISION,
  cached_price_per_token DOUBLE PRECISION,
  -- (input-cached)*input + cached*cached + output*output + thinking*thinking; NULL when unpriced.
  cost DOUBLE PRECISION,
  -- The exact request: { systemInstruction, contents, config } with binary
  -- parts replaced by {inlineData:{mimeType,sizeBytes}} placeholders.
  request JSONB NOT NULL,
  -- The model's text output (JSON for schema-forced calls); NULL on errors.
  response TEXT
);

CREATE INDEX llm_calls_created_idx ON llm_calls (created_at DESC);
CREATE INDEX llm_calls_client_idx ON llm_calls (client_id, created_at DESC);
CREATE INDEX llm_calls_instance_idx ON llm_calls (agent_instance_id, created_at DESC);
