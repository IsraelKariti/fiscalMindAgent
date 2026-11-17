import { fetchUsers, type MondayUser } from '../shared/mondayData.js';
import { parseSettings } from './settings.js';
import type { StoredTaxAdvisor } from './taxAdvisor.js';
import type { BoardSource } from '../shared/clientSources.js';
import type { AgentInstanceRow, ClientRow } from '../../db/types.js';

/** The users lookup `resolveTaxAdvisor` (kickoff.ts) calls; the backfill passes a per-run memo. */
export type MondayUsersLookup = typeof fetchUsers;

/**
 * The pure steps of the admin's advisor re-read (openspec `client-tax-advisor`,
 * change `backfill-tax-advisor`), kept free of database / Redis imports so
 * `tests/taxAdvisorBackfill.test.ts` can load them. The walk itself is in
 * taxAdvisorBackfill.ts.
 */

/** The remembered monday row of a kicked-off client; null when the client never came through the kickoff. */
export function rememberedRow(client: Pick<ClientRow, 'agent_fields'>): { boardId: string; itemId: string } | null {
  const boardId = client.agent_fields['monday_board_id'];
  const itemId = client.agent_fields['monday_item_id'];
  if (typeof boardId !== 'string' || !boardId || typeof itemId !== 'string' || !itemId) return null;
  return { boardId, itemId };
}

/** The configured board the row belongs to, only when it maps the advisor column; null = nothing to read. */
export function boardForRow(instance: Pick<AgentInstanceRow, 'settings'>, boardId: string): BoardSource | null {
  const board = parseSettings(instance.settings).boards.find((b) => b.boardId === boardId);
  if (!board || !board.taxAdvisorColumnId) return null;
  return board;
}

/**
 * Whether storing `next` changes the client's advisor: the person (monday
 * user id) or the match differs. A refreshed name or email alone is not a
 * change, so a second run re-audits nothing.
 */
export function advisorChanged(previous: StoredTaxAdvisor | null, next: StoredTaxAdvisor | null): boolean {
  if (!previous && !next) return false;
  if (!previous || !next) return true;
  return previous.monday_user_id !== next.monday_user_id || previous.match !== next.match;
}

/** A per-run memo over the monday users lookup: many clients share one advisor. */
export function memoisedUsersLookup(base: MondayUsersLookup = fetchUsers): MondayUsersLookup {
  const cache = new Map<string, MondayUser[]>();
  return async (accessToken, ids) => {
    const key = ids.join(',');
    const hit = cache.get(key);
    if (hit) return hit;
    const found = await base(accessToken, ids);
    cache.set(key, found);
    return found;
  };
}
