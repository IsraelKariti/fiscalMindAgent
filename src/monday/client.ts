import { logger } from '../util/logger.js';

/**
 * Server-side monday.com GraphQL client, authenticated by a stored
 * per-accountant OAuth token (monday_oauth_tokens) — unlike the widget's
 * seamless in-iframe auth (web/src/monday/sdk.ts), this works at webhook time
 * with no browser involved.
 */

const MONDAY_API_URL = 'https://api.monday.com/v2';
const MONDAY_API_VERSION = '2025-01';
/** The webhook reply path calls monday inline — a hung call must not hang it. */
const REQUEST_TIMEOUT_MS = 15_000;

export class MondayApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MondayApiError';
  }
}

export async function mondayGraphQL<T>(
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(MONDAY_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: accessToken,
      'API-Version': MONDAY_API_VERSION,
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new MondayApiError(`monday API HTTP ${response.status}`);
  }
  const body = (await response.json()) as { data?: T; errors?: { message?: string }[] };
  if (body.errors?.length) {
    const message = body.errors[0]?.message ?? 'unknown GraphQL error';
    logger.warn('monday graphql error', { message });
    throw new MondayApiError(`monday API error: ${message}`);
  }
  if (body.data === undefined) throw new MondayApiError('monday API returned no data');
  return body.data;
}
