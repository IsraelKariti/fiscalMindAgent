import { pool } from '../pool.js';
import { env } from '../../config/env.js';

export interface LlmModelUsageListRow {
  user_id: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  thinking_tokens: number;
}

/** One day×accountant×instance×model bucket of the admin spend time series. */
export interface LlmDailyUsageRow {
  day: string;
  user_id: string;
  agent_instance_id: string | null;
  /** 'doc_collector' for legacy NULL-instance rows (same convention as clients.agent_instance_id). */
  agent_type: string;
  instance_name: string | null;
  model: string;
  input_tokens: number;
  output_tokens: number;
  thinking_tokens: number;
}

/** Today's date ("YYYY-MM-DD") on the accountants' wall clock — the daily-usage bucket key. */
function usageDay(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: env.ACCOUNTANT_TIMEZONE }).format(new Date());
}

/**
 * Adds one Gemini call's token counts to the user's lifetime counters for the
 * model that served it, and to today's (user, agent instance, model) bucket of
 * the daily spend time series. agentInstanceId is null only for legacy
 * CLI-era clients that predate agent_instances.
 */
export async function add(
  userId: string,
  agentInstanceId: string | null,
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
  await pool.query(
    `INSERT INTO llm_usage_daily (day, user_id, agent_instance_id, model, input_tokens, output_tokens, thinking_tokens)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (day, user_id, agent_instance_id, model) DO UPDATE
       SET input_tokens    = llm_usage_daily.input_tokens + EXCLUDED.input_tokens,
           output_tokens   = llm_usage_daily.output_tokens + EXCLUDED.output_tokens,
           thinking_tokens = llm_usage_daily.thinking_tokens + EXCLUDED.thinking_tokens,
           updated_at = now()`,
    [usageDay(), userId, agentInstanceId, model, usage.inputTokens, usage.outputTokens, usage.thinkingTokens],
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

/**
 * The daily buckets from `sinceDay` ("YYYY-MM-DD", inclusive) onward, with the
 * owning instance's type and name — admin spend analytics only. day::text so
 * pg never converts the DATE through the server timezone.
 */
export async function listDaily(sinceDay: string): Promise<LlmDailyUsageRow[]> {
  const { rows } = await pool.query<LlmDailyUsageRow>(
    `SELECT d.day::text AS day, d.user_id, d.agent_instance_id,
            COALESCE(ai.agent_type, 'doc_collector') AS agent_type,
            ai.name AS instance_name,
            d.model,
            d.input_tokens::float8 AS input_tokens,
            d.output_tokens::float8 AS output_tokens,
            d.thinking_tokens::float8 AS thinking_tokens
     FROM llm_usage_daily d
     LEFT JOIN agent_instances ai ON ai.id = d.agent_instance_id
     WHERE d.day >= $1
     ORDER BY d.day`,
    [sinceDay],
  );
  return rows;
}
