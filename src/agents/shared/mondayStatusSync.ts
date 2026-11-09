import * as agentInstances from '../../db/queries/agentInstances.js';
import * as clients from '../../db/queries/clients.js';
import * as mondayOauthTokens from '../../db/queries/mondayOauthTokens.js';
import { changeItemStatusLabel } from './mondayData.js';
import { documentsStatusInputOf, documentsStatusLabelOf } from './mondayDocumentsStatus.js';
import { parseSettings } from '../declarationOfCapital/settings.js';
import { logger } from '../../util/logger.js';

/**
 * Board status sync: the agent mirrors the client dot back to the client's
 * monday row by writing a label into the board's mapped documents status
 * column (BoardSourceSchema.documentsStatusColumnId, openspec
 * `monday-documents-status`). The row's address is remembered on the client
 * (agent_fields.monday_board_id / monday_item_id — stamped by the import scan
 * and the kickoff webhook), so the write-back survives later edits to the
 * row's phone/email cells.
 *
 * The label is derived from the client's stored state *after* the event
 * (mondayDocumentsStatus.ts), so every call site — kickoff, completion,
 * reopen, decline, overdue stop, resume — simply calls this once the stored
 * change has landed.
 *
 * Best-effort by design: a monday outage, a missing mapping, a test client
 * (never stamped with a row) or a pre-boards:write token must never block the
 * conversation itself — failures are logged and dropped.
 */
export async function syncMondayDocumentsStatus(clientId: string): Promise<void> {
  try {
    const client = await clients.getById(clientId);
    if (!client?.agent_instance_id) return;
    const boardId = client.agent_fields['monday_board_id'];
    const itemId = client.agent_fields['monday_item_id'];
    if (typeof boardId !== 'string' || typeof itemId !== 'string') return;

    const instance = await agentInstances.getById(client.agent_instance_id);
    if (!instance) return;
    const board = parseSettings(instance.settings).boards.find((b) => b.boardId === boardId);
    if (!board?.documentsStatusColumnId) return;

    const token = await mondayOauthTokens.getByUserId(instance.user_id);
    if (!token) {
      logger.warn('monday documents status sync: accountant has no monday connection', { clientId, boardId });
      return;
    }
    const label = documentsStatusLabelOf(documentsStatusInputOf(client));
    await changeItemStatusLabel(token.access_token, { boardId, itemId, columnId: board.documentsStatusColumnId, label });
    logger.info('monday documents status sync: label written', { clientId, boardId, itemId, label });
  } catch (err) {
    logger.warn('monday documents status sync failed', { clientId, reason: String(err) });
  }
}
