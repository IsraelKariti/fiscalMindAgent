-- Per-model Gemini token usage per accountant. Models bill at different rates,
-- and the admin can now switch the active model at runtime, so pricing all
-- lifetime tokens at one model's rates (the old users counters) would misstate
-- costs after a switch. Lifetime counters — never reset — hence BIGINT.
CREATE TABLE llm_model_usage (
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  model           TEXT NOT NULL,
  input_tokens    BIGINT NOT NULL DEFAULT 0,
  output_tokens   BIGINT NOT NULL DEFAULT 0,
  thinking_tokens BIGINT NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, model)
);

-- Attribute the existing lifetime counters to gemini-2.5-flash: until the model
-- became switchable (shipped together with this migration), every call ran on
-- the fixed GEMINI_MODEL env default, which has always been gemini-2.5-flash.
INSERT INTO llm_model_usage (user_id, model, input_tokens, output_tokens, thinking_tokens)
SELECT id, 'gemini-2.5-flash', llm_input_tokens, llm_output_tokens, llm_thinking_tokens
FROM users
WHERE llm_input_tokens > 0 OR llm_output_tokens > 0 OR llm_thinking_tokens > 0;

ALTER TABLE users
  DROP COLUMN llm_input_tokens,
  DROP COLUMN llm_output_tokens,
  DROP COLUMN llm_thinking_tokens;
