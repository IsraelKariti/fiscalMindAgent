import { pool } from '../pool.js';
import { env } from '../../config/env.js';

/**
 * Aggregates over tax_fetch_sessions for the admin site-access screen
 * (openspec `admin-site-access`). Both queries return one row per provider ×
 * document key; a session with NULL document_keys lands in a NULL-key bucket
 * that the report expands to every product the provider offers.
 */

/** A session counts as an access once it reached the site (login started or a code was requested). */
const REACHED_SITE = `(status IN ('logging_in','verifying','downloading','delivered','failed') OR otp_requested_at IS NOT NULL)`;

export interface SiteAccessCountRow {
  provider: string;
  /** NULL = the session named no document keys. */
  document_key: string | null;
  total: number;
  today: number;
  last7: number;
  last30: number;
}

/**
 * Access counts per provider × document key. "Today / last 7 / last 30" are
 * whole calendar days on the accountants' wall clock (ACCOUNTANT_TIMEZONE,
 * Asia/Jerusalem in production), ending today and inclusive, by created_at.
 */
export async function countAccesses(): Promise<SiteAccessCountRow[]> {
  const { rows } = await pool.query<SiteAccessCountRow>(
    `WITH reached AS (
       SELECT provider, document_keys, (created_at AT TIME ZONE $1)::date AS day
       FROM tax_fetch_sessions
       WHERE ${REACHED_SITE}
     ),
     keyed AS (
       SELECT provider, k.document_key, day
       FROM reached
       LEFT JOIN LATERAL unnest(document_keys) AS k(document_key) ON TRUE
     ),
     today AS (SELECT (now() AT TIME ZONE $1)::date AS d)
     SELECT provider,
            document_key,
            count(*)::int AS total,
            count(*) FILTER (WHERE day = today.d)::int AS today,
            count(*) FILTER (WHERE day > today.d - 7)::int AS last7,
            count(*) FILTER (WHERE day > today.d - 30)::int AS last30
     FROM keyed, today
     GROUP BY provider, document_key`,
    [env.ACCOUNTANT_TIMEZONE],
  );
  return rows;
}

export interface SiteAccessRecentRow {
  provider: string;
  document_key: string | null;
  status: 'delivered' | 'failed';
  error: string | null;
  updated_at: Date;
}

/** The two newest finished (delivered / failed) accesses per provider × document key, newest first. */
export async function recentFinished(): Promise<SiteAccessRecentRow[]> {
  const { rows } = await pool.query<SiteAccessRecentRow>(
    `WITH keyed AS (
       SELECT s.provider, k.document_key, s.status, s.error, s.updated_at
       FROM tax_fetch_sessions s
       LEFT JOIN LATERAL unnest(s.document_keys) AS k(document_key) ON TRUE
       WHERE s.status IN ('delivered','failed')
     ),
     ranked AS (
       SELECT *, row_number() OVER (PARTITION BY provider, document_key ORDER BY updated_at DESC) AS rn
       FROM keyed
     )
     SELECT provider, document_key, status, error, updated_at
     FROM ranked
     WHERE rn <= 2
     ORDER BY provider, document_key, updated_at DESC`,
  );
  return rows;
}

export interface SiteAccessLastRow {
  /** The session's id — the card links to its evidence gallery (openspec `fetch-step-evidence`). */
  id: string;
  provider: string;
  document_key: string | null;
  status: string;
  error: string | null;
  updated_at: Date;
}

/** The newest access of any outcome per provider × document key (the "last access" line). */
export async function lastAccess(): Promise<SiteAccessLastRow[]> {
  const { rows } = await pool.query<SiteAccessLastRow>(
    `WITH keyed AS (
       SELECT s.id, s.provider, k.document_key, s.status, s.error, s.updated_at
       FROM tax_fetch_sessions s
       LEFT JOIN LATERAL unnest(s.document_keys) AS k(document_key) ON TRUE
       WHERE ${REACHED_SITE}
     )
     SELECT DISTINCT ON (provider, document_key) id, provider, document_key, status, error, updated_at
     FROM keyed
     ORDER BY provider, document_key, updated_at DESC`,
  );
  return rows;
}
