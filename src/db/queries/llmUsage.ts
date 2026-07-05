import { pool } from '../pool.js';

export interface LlmModelUsageListRow {
  user_id: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  thinking_tokens: number;
}

/** Adds one Gemini call's token counts to the user's lifetime counters for the model that served it. */
export async function add(
  userId: string,
  model: string,
  usage: { inputTokens: number; outputTokens: number; thinkingTokens: number },
): Promise<void> {
  await pool.query(
    `INSERT INTO llm_model_usage (user_id, model, input_tokens, output_tokens, thinking_tokens)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, model) DO UPDATE
       SET input_tokens    = llm_model_usage.input_tokens + EXCLUDED.input_tokens,
           output_tokens   = llm_model_usage.output_tokens + EXCLUDED.output_tokens,
           thinking_tokens = llm_model_usage.thinking_tokens + EXCLUDED.thinking_tokens,
           updated_at = now()`,
    [userId, model, usage.inputTokens, usage.outputTokens, usage.thinkingTokens],
  );
}

/**
 * Every user's per-model counters — admin panel only. BIGINTs cast to float8;
 * lifetime token counts stay far below 2^53, so the cast is lossless in practice.
 */
export async function listAll(): Promise<LlmModelUsageListRow[]> {
  const { rows } = await pool.query<LlmModelUsageListRow>(
    `SELECT user_id, model,
            input_tokens::float8 AS input_tokens,
            output_tokens::float8 AS output_tokens,
            thinking_tokens::float8 AS thinking_tokens
     FROM llm_model_usage
     ORDER BY model`,
  );
  return rows;
}
