-- Cumulative Gemini token usage per accountant. Incremented after every LLM
-- call the agent makes on behalf of one of the user's clients, and surfaced
-- only on the admin dashboard (accountants table). Lifetime counters — never
-- reset — hence BIGINT.
ALTER TABLE users
  ADD COLUMN llm_input_tokens    BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN llm_output_tokens   BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN llm_thinking_tokens BIGINT NOT NULL DEFAULT 0;
