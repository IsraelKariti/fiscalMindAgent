import * as agentInstances from '../../db/queries/agentInstances.js';
import * as clients from '../../db/queries/clients.js';
import * as mondayOauthTokens from '../../db/queries/mondayOauthTokens.js';
import { changeItemStatusLabel } from '../customerService/mondayData.js';
import { isDocCollectorFamily } from '../docCollector/family.js';
import { parseSettings as parseDocCollectorSettings } from '../docCollector/settings.js';
import { logger } from '../../util/logger.js';

/**
 * Board status sync: the agent reports its progress back to the client's
 * monday row by writing a label into the board's mapped status column
 * (BoardSourceSchema.statusColumnId). The row's address is remembered on the
 * client (agent_fields.monday_board_id / monday_item_id — stamped by the
 * import scan and the kickoff webhook), so the write-back survives later
 * edits to the row's phone/email cells.
 *
 * Best-effort by design: a monday outage, a missing mapping, or a pre-
 * boards:write token must never block the conversation itself — failures are
 * logged and dropped.
 */

/** The conversation started (kickoff webhook / workspace resume of a never-contacted client). */
export const MONDAY_STATUS_AGENT_WORKING = 'בטיפול סוכן';
/** The goal completed — every required document is in. */
export const MONDAY_STATUS_DOCS_COLLECTED = 'מסמכים נאספו';

/** Writes `label` to the client's board row; a no-op unless the client carries a monday address and its board maps a status column. */
export async function syncMondayStatus(clientId: string, label: string): Promise<void> {
  try {
    const client = await clients.getById(clientId);
    if (!client?.agent_instance_id) return;
    const boardId = client.agent_fields['monday_board_id'];
    const itemId = client.agent_fields['monday_item_id'];
    if (typeof boardId !== 'string' || typeof itemId !== 'string') return;

    const instance = await agentInstances.getById(client.agent_instance_id);
    // The status column mapping lives in the doc-collector-family settings —
    // the only family that configures board client sources today.
    if (!instance || !isDocCollectorFamily(instance.agent_type)) return;
    const board = parseDocCollectorSettings(instance.settings).boards.find((b) => b.boardId === boardId);
    if (!board?.statusColumnId) return;

    const token = await mondayOauthTokens.getByUserId(instance.user_id);
    if (!token) {
      logger.warn('monday status sync: accountant has no monday connection', { clientId, boardId });
      return;
    }
    await changeItemStatusLabel(token.access_token, { boardId, itemId, columnId: board.statusColumnId, label });
    logger.info('monday status sync: label written', { clientId, boardId, itemId });
  } catch (err) {
    // Likely causes: token predates the boards:write scope (reconnect monday),
    // or the row/column was deleted on the board.
    logger.warn('monday status sync failed', { clientId, reason: String(err) });
  }
}
