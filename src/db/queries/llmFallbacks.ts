import { pool } from '../pool.js';

/**
 * The raw material of the admin fallbacks page (openspec
 * `fallbacks-dashboard`): llm_calls counted by (model, provider, stage,
 * fallback mark, status) over a period. Rows are few (models × stages ×
 * reasons × 2), so the page never loads call rows. The outage probe's calls
 * are left out: they are pinned, backup-less pings of a held provider, not
 * work of a stage.
 */
export interface FallbackGroupRow {
  model: string;
  provider: string;
  purpose: string;
  fallback_from_model: string | null;
  fallback_from_provider: string | null;
  fallback_reason: string | null;
  status: 'ok' | 'error';
  calls: number;
}

export interface FallbackPeriodMeta {
  /** When the first marked backup row was made; null when no call ever fell back since the mark exists. */
  first_marked_at: Date | null;
  /** The oldest call of the period; null when the period has no call. */
  oldest_in_period: Date | null;
}

const NOT_PROBE = "lc.purpose <> 'outage_probe'";

/** Every group of the calls made since `since` (every call when null). */
export async function listGroups(since: Date | null): Promise<FallbackGroupRow[]> {
  const { rows } = await pool.query<FallbackGroupRow>(
    `SELECT lc.model, lc.provider, lc.purpose,
            lc.fallback_from_model, lc.fallback_from_provider, lc.fallback_reason,
            lc.status,
            COUNT(*)::float8 AS calls
     FROM llm_calls lc
     WHERE ${NOT_PROBE} ${since ? 'AND lc.created_at >= $1' : ''}
     GROUP BY lc.model, lc.provider, lc.purpose,
              lc.fallback_from_model, lc.fallback_from_provider, lc.fallback_reason, lc.status`,
    since ? [since] : [],
  );
  return rows;
}

/** The dates the page's "recorded since" note needs. */
export async function periodMeta(since: Date | null): Promise<FallbackPeriodMeta> {
  const { rows } = await pool.query<FallbackPeriodMeta>(
    `SELECT (SELECT MIN(created_at) FROM llm_calls WHERE fallback_from_model IS NOT NULL) AS first_marked_at,
            (SELECT MIN(lc.created_at) FROM llm_calls lc WHERE ${NOT_PROBE} ${since ? 'AND lc.created_at >= $1' : ''}) AS oldest_in_period`,
    since ? [since] : [],
  );
  return rows[0] ?? { first_marked_at: null, oldest_in_period: null };
}
