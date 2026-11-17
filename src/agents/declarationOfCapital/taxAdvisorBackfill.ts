import * as clients from '../../db/queries/clients.js';
import * as mondayOauthTokens from '../../db/queries/mondayOauthTokens.js';
import { recordAudit } from '../../audit/audit.js';
import { publishClientUpdated } from '../../events/clientEvents.js';
import { fetchItemDetails } from '../shared/mondayData.js';
import { resolveTaxAdvisor, taxAdvisorAuditDetail } from './kickoff.js';
import { readTaxAdvisor, type StoredTaxAdvisor } from './taxAdvisor.js';
import { advisorChanged, boardForRow, memoisedUsersLookup, rememberedRow, type MondayUsersLookup } from './taxAdvisorBackfillRules.js';
import { logger } from '../../util/logger.js';
import type { BoardSource } from '../shared/clientSources.js';
import type { AgentInstanceRow, ClientRow } from '../../db/types.js';

/**
 * The admin's one-press advisor re-read (openspec `client-tax-advisor`,
 * change `backfill-tax-advisor`): every live client of the agent that
 * remembers its monday row gets its advisor cell read again through the
 * kickoff's own `resolveTaxAdvisor`, so a client enrolled before the board
 * mapped its people column catches up without the accountant pressing the
 * kickoff again. Nothing else on the client changes, nothing is sent, nothing
 * is written to monday. One named function per step: backfillTaxAdvisors,
 * rereadAdvisor, storeBackfilledAdvisor here; rememberedRow, boardForRow,
 * advisorChanged, memoisedUsersLookup in taxAdvisorBackfillRules.ts.
 */

export interface TaxAdvisorBackfillCounts {
  /** A person is now stored where none was, or another person replaced the stored one. */
  updated: number;
  /** The cell is empty and the stored advisor was removed. */
  cleared: number;
  /** Same person and match as before (or none before and none now). */
  unchanged: number;
  /** No remembered row, board no longer a configured source, or board without the advisor mapping. */
  skipped: number;
  /** The row could not be fetched (deleted on monday, API error). */
  failed: number;
}

export type TaxAdvisorBackfillResult =
  | ({ ok: true } & TaxAdvisorBackfillCounts)
  | { ok: false; error: 'no_monday_connection' };

const PROGRESS_EVERY = 25;

/** The advisor the row names now; `undefined` = the row could not be fetched. */
async function rereadAdvisor(
  instance: AgentInstanceRow,
  board: BoardSource,
  itemId: string,
  accessToken: string,
  lookup: MondayUsersLookup,
  log: Record<string, unknown>,
): Promise<{ fetched: true; advisor: StoredTaxAdvisor | null | undefined } | { fetched: false }> {
  try {
    const row = await fetchItemDetails(accessToken, itemId);
    if (!row) {
      logger.warn('tax advisor backfill: remembered row not found on monday', log);
      return { fetched: false };
    }
    return { fetched: true, advisor: await resolveTaxAdvisor(instance, board, row, accessToken, log, lookup) };
  } catch (err) {
    logger.error('tax advisor backfill: row fetch failed', err, log);
    return { fetched: false };
  }
}

/** Stores the re-read advisor (null clears) and audits the change with the real admin as the actor. */
async function storeBackfilledAdvisor(
  instance: AgentInstanceRow,
  client: ClientRow,
  previous: StoredTaxAdvisor | null,
  next: StoredTaxAdvisor | null,
  adminUserId: string,
): Promise<void> {
  await clients.setDeclarationEngagement(client.id, { taxAdvisor: next ? { ...next } : null });
  recordAudit({
    actorType: 'admin',
    actorUserId: adminUserId,
    action: 'client.tax_advisor_backfilled',
    agentInstanceId: instance.id,
    clientId: client.id,
    detail: {
      clientName: client.name,
      previous: previous ? { name: previous.name, match: previous.match } : null,
      ...taxAdvisorAuditDetail(next),
      ...(next ? {} : { taxAdvisor: null }),
    },
  });
  publishClientUpdated(client.id);
}

/**
 * Walks the agent's live clients (test clients excluded) and re-reads each
 * remembered row's advisor cell. Refuses before touching anything when the
 * accountant has no monday connection. Never throws on a single client: a
 * row that cannot be read counts as failed and the walk goes on.
 */
export async function backfillTaxAdvisors(instance: AgentInstanceRow, adminUserId: string): Promise<TaxAdvisorBackfillResult> {
  const token = await mondayOauthTokens.getByUserId(instance.user_id);
  if (!token) return { ok: false, error: 'no_monday_connection' };
  const roster = await clients.listForInstance(instance.id);
  const counts: TaxAdvisorBackfillCounts = { updated: 0, cleared: 0, unchanged: 0, skipped: 0, failed: 0 };
  const lookup = memoisedUsersLookup();
  let walked = 0;
  for (const client of roster) {
    walked += 1;
    const log = { instanceId: instance.id, clientId: client.id, adminUserId };
    const row = rememberedRow(client);
    const board = row ? boardForRow(instance, row.boardId) : null;
    if (!row || !board) {
      counts.skipped += 1;
      continue;
    }
    const read = await rereadAdvisor(instance, board, row.itemId, token.access_token, lookup, { ...log, ...row });
    if (!read.fetched) {
      counts.failed += 1;
      continue;
    }
    if (read.advisor === undefined) {
      // Mapping vanished between boardForRow and the read — nothing to store.
      counts.skipped += 1;
      continue;
    }
    const previous = readTaxAdvisor(client.agent_fields);
    if (!advisorChanged(previous, read.advisor)) {
      counts.unchanged += 1;
      continue;
    }
    try {
      await storeBackfilledAdvisor(instance, client, previous, read.advisor, adminUserId);
      if (read.advisor) counts.updated += 1;
      else counts.cleared += 1;
    } catch (err) {
      logger.error('tax advisor backfill: storing the advisor failed', err, log);
      counts.failed += 1;
    }
    if (walked % PROGRESS_EVERY === 0) {
      logger.info('tax advisor backfill: progress', { instanceId: instance.id, walked, total: roster.length, ...counts });
    }
  }
  logger.info('tax advisor backfill: done', { instanceId: instance.id, adminUserId, total: roster.length, ...counts });
  return { ok: true, ...counts };
}
