import { pool } from '../pool.js';

/**
 * Per-call LLM observability (049): one row per LLM API call with the exact
 * request, the response, token counts by kind, and the per-token prices at
 * call time. Written from generate.ts for every call site that passes a log
 * context; read only by the admin panel.
 */

export interface LlmCallRow {
  id: string;
  created_at: Date;
  user_id: string | null;
  agent_instance_id: string | null;
  client_id: string | null;
  variant: string | null;
  purpose: string;
  provider: string;
  model: string;
  status: 'ok' | 'error';
  error: string | null;
  attempts: number;
  duration_ms: number | null;
  input_tokens: number;
  output_tokens: number;
  thinking_tokens: number;
  cached_tokens: number;
  input_price_per_token: number | null;
  output_price_per_token: number | null;
  thinking_price_per_token: number | null;
  cached_price_per_token: number | null;
  cost: number | null;
  request: Record<string, unknown>;
  response: string | null;
}

/** The list view's row — everything except the (potentially large) payloads. */
export type LlmCallListRow = Omit<LlmCallRow, 'request' | 'response'> & { client_name: string | null };

export interface InsertLlmCall {
  userId: string | null;
  agentInstanceId: string | null;
  clientId: string | null;
  variant: string | null;
  purpose: string;
  provider: string;
  model: string;
  status: 'ok' | 'error';
  error: string | null;
  attempts: number;
  durationMs: number | null;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  cachedTokens: number;
  inputPricePerToken: number | null;
  outputPricePerToken: number | null;
  thinkingPricePerToken: number | null;
  cachedPricePerToken: number | null;
  cost: number | null;
  request: Record<string, unknown>;
  response: string | null;
}

export async function insert(call: InsertLlmCall): Promise<void> {
  await pool.query(
    `INSERT INTO llm_calls (
       user_id, agent_instance_id, client_id, variant, purpose, provider, model,
       status, error, attempts, duration_ms,
       input_tokens, output_tokens, thinking_tokens, cached_tokens,
       input_price_per_token, output_price_per_token, thinking_price_per_token, cached_price_per_token,
       cost, request, response
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
    [
      call.userId,
      call.agentInstanceId,
      call.clientId,
      call.variant,
      call.purpose,
      call.provider,
      call.model,
      call.status,
      call.error,
      call.attempts,
      call.durationMs,
      call.inputTokens,
      call.outputTokens,
      call.thinkingTokens,
      call.cachedTokens,
      call.inputPricePerToken,
      call.outputPricePerToken,
      call.thinkingPricePerToken,
      call.cachedPricePerToken,
      call.cost,
      JSON.stringify(call.request),
      call.response,
    ],
  );
}

export interface LlmCallFilters {
  agentInstanceId?: string;
  clientId?: string;
  variant?: string;
  purpose?: string;
  model?: string;
  /** Return calls created strictly before this instant (keyset pagination). */
  before?: Date;
  limit: number;
}

/** Newest-first page of calls without payloads — the admin browser's list. */
export async function list(filters: LlmCallFilters): Promise<LlmCallListRow[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (clause: string, value: unknown) => {
    params.push(value);
    where.push(`${clause} $${params.length}`);
  };
  if (filters.agentInstanceId) add('lc.agent_instance_id =', filters.agentInstanceId);
  if (filters.clientId) add('lc.client_id =', filters.clientId);
  if (filters.variant) add('lc.variant =', filters.variant);
  if (filters.purpose) add('lc.purpose =', filters.purpose);
  if (filters.model) add('lc.model =', filters.model);
  if (filters.before) add('lc.created_at <', filters.before);
  params.push(filters.limit);
  const { rows } = await pool.query<LlmCallListRow>(
    `SELECT lc.id, lc.created_at, lc.user_id, lc.agent_instance_id, lc.client_id, lc.variant,
            lc.purpose, lc.provider, lc.model, lc.status, lc.error, lc.attempts, lc.duration_ms,
            lc.input_tokens::float8 AS input_tokens,
            lc.output_tokens::float8 AS output_tokens,
            lc.thinking_tokens::float8 AS thinking_tokens,
            lc.cached_tokens::float8 AS cached_tokens,
            lc.input_price_per_token, lc.output_price_per_token,
            lc.thinking_price_per_token, lc.cached_price_per_token,
            lc.cost,
            c.name AS client_name
     FROM llm_calls lc
     LEFT JOIN clients c ON c.id = lc.client_id
     ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY lc.created_at DESC
     LIMIT $${params.length}`,
    params,
  );
  return rows;
}

/** One call with its full request/response payloads — the admin drill-down. */
export async function getById(id: string): Promise<LlmCallRow | null> {
  const { rows } = await pool.query<LlmCallRow>(
    `SELECT id, created_at, user_id, agent_instance_id, client_id, variant,
            purpose, provider, model, status, error, attempts, duration_ms,
            input_tokens::float8 AS input_tokens,
            output_tokens::float8 AS output_tokens,
            thinking_tokens::float8 AS thinking_tokens,
            cached_tokens::float8 AS cached_tokens,
            input_price_per_token, output_price_per_token,
            thinking_price_per_token, cached_price_per_token,
            cost, request, response
     FROM llm_calls WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export interface VariantStatsRow {
  variant: string | null;
  model: string;
  calls: number;
  error_calls: number;
  clients: number;
  input_tokens: number;
  output_tokens: number;
  thinking_tokens: number;
  cached_tokens: number;
  /** Sum over priced calls only; NULL when no call in the group was priced. */
  cost: number | null;
  unpriced_calls: number;
}

/**
 * The experiment scoreboard: per (variant, model) totals for one instance's
 * calls. Cost sums the call-time prices, so it reflects what the calls
 * actually cost, not today's rates.
 */
export async function statsForInstance(agentInstanceId: string): Promise<VariantStatsRow[]> {
  const { rows } = await pool.query<VariantStatsRow>(
    `SELECT variant, model,
            COUNT(*)::int AS calls,
            COUNT(*) FILTER (WHERE status = 'error')::int AS error_calls,
            COUNT(DISTINCT client_id)::int AS clients,
            SUM(input_tokens)::float8 AS input_tokens,
            SUM(output_tokens)::float8 AS output_tokens,
            SUM(thinking_tokens)::float8 AS thinking_tokens,
            SUM(cached_tokens)::float8 AS cached_tokens,
            SUM(cost) AS cost,
            COUNT(*) FILTER (WHERE cost IS NULL)::int AS unpriced_calls
     FROM llm_calls
     WHERE agent_instance_id = $1
     GROUP BY variant, model
     ORDER BY variant NULLS LAST, model`,
    [agentInstanceId],
  );
  return rows;
}
