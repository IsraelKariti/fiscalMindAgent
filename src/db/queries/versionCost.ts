import { pool } from '../pool.js';

/**
 * Which clients' calls count on the admin versions page (openspec
 * `cost-per-version`): every call, live clients only, or admin test clients
 * only. A call with no client counts under 'all' only.
 */
export type ClientKind = 'all' | 'live' | 'test';

export interface VersionCostFilters {
  agentInstanceId?: string;
  clientKind: ClientKind;
}

/** One (app version, purpose) group of llm_calls — the raw material of the versions page. */
export interface VersionPurposeGroup {
  /** NULL on calls older than migration 078. */
  app_version: string | null;
  purpose: string;
  calls: number;
  failed: number;
  /** SUM(cost) over priced calls; 0 when none is priced. */
  cost: number;
  /** Calls whose cost is NULL. */
  unpriced: number;
  input_tokens: number;
  output_tokens: number;
  thinking_tokens: number;
  cached_tokens: number;
  /** Distinct planning cycles (plan_run_id) among the group's calls. */
  cycles: number;
  /** Distinct files (document_file_id) among the group's calls. */
  files: number;
  first_at: Date;
  last_at: Date;
}

/**
 * Every (version, purpose) group of the calls the filters include, with the
 * sums the pure summariser needs. Rows are few (versions × stages), so the
 * page never loads call rows.
 */
export async function listByVersion(filters: VersionCostFilters): Promise<VersionPurposeGroup[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.agentInstanceId) {
    params.push(filters.agentInstanceId);
    where.push(`lc.agent_instance_id = $${params.length}`);
  }
  if (filters.clientKind === 'live') where.push('c.is_test = false');
  if (filters.clientKind === 'test') where.push('c.is_test = true');
  const { rows } = await pool.query<VersionPurposeGroup>(
    `SELECT lc.app_version, lc.purpose,
            COUNT(*)::float8 AS calls,
            COUNT(*) FILTER (WHERE lc.status = 'error')::float8 AS failed,
            COALESCE(SUM(lc.cost), 0)::float8 AS cost,
            COUNT(*) FILTER (WHERE lc.cost IS NULL)::float8 AS unpriced,
            SUM(lc.input_tokens)::float8 AS input_tokens,
            SUM(lc.output_tokens)::float8 AS output_tokens,
            SUM(lc.thinking_tokens)::float8 AS thinking_tokens,
            SUM(lc.cached_tokens)::float8 AS cached_tokens,
            COUNT(DISTINCT lc.plan_run_id)::float8 AS cycles,
            COUNT(DISTINCT lc.document_file_id)::float8 AS files,
            MIN(lc.created_at) AS first_at,
            MAX(lc.created_at) AS last_at
     FROM llm_calls lc
     LEFT JOIN clients c ON c.id = lc.client_id
     ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
     GROUP BY lc.app_version, lc.purpose`,
    params,
  );
  return rows;
}

export interface InstanceWithCalls {
  id: string;
  name: string | null;
  accountant_email: string | null;
}

/** The agent instances that have at least one call — the page's instance filter offers only these. */
export async function listInstancesWithCalls(): Promise<InstanceWithCalls[]> {
  const { rows } = await pool.query<InstanceWithCalls>(
    `SELECT ai.id, ai.name, u.email AS accountant_email
     FROM agent_instances ai
     LEFT JOIN users u ON u.id = ai.user_id
     WHERE EXISTS (SELECT 1 FROM llm_calls lc WHERE lc.agent_instance_id = ai.id)
     ORDER BY u.email, ai.name`,
  );
  return rows;
}
