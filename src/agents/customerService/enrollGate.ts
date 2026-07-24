import { getFreshGoogleAccessToken } from '../../api/googleOauth.js';
import * as mondayOauthTokens from '../../db/queries/mondayOauthTokens.js';
import { logger } from '../../util/logger.js';
import type { AgentInstanceRow } from '../../db/types.js';
import { fetchSheetRowsByPhone } from './googleData.js';
import { fetchRowsByPhone } from './mondayData.js';
import { parseSettings } from './settings.js';

/**
 * Enrollment lockdown for the customer-service agent: an unknown WhatsApp
 * sender may only be auto-enrolled if their number matches a row in the
 * accountant's connected client records (monday boards / Google Sheets) —
 * the same phonesMatch verification that scopes the prompt data. No records
 * configured, connection down, or no match all mean "not listed": strangers
 * get silence, no client row and no LLM call. Fail-closed by design.
 */
export async function isListedClientPhone(instance: AgentInstanceRow, waPhone: string): Promise<boolean> {
  const settings = parseSettings(instance.settings);
  const checks: Promise<boolean>[] = [];

  if (settings.boards.length > 0) {
    checks.push(
      (async () => {
        const token = await mondayOauthTokens.getByUserId(instance.user_id);
        if (!token) return false;
        const results = await Promise.allSettled(
          settings.boards.map((b) =>
            fetchRowsByPhone(token.access_token, b.boardId, b.phoneColumnId, waPhone, b.nameColumnId),
          ),
        );
        return results.some((r) => r.status === 'fulfilled' && r.value.rows.length > 0);
      })(),
    );
  }

  if (settings.sheets.length > 0) {
    checks.push(
      (async () => {
        const token = await getFreshGoogleAccessToken(instance.user_id);
        if (!token) return false;
        const results = await Promise.allSettled(
          settings.sheets.map((s) => fetchSheetRowsByPhone(token, s, waPhone)),
        );
        return results.some((r) => r.status === 'fulfilled' && r.value.rows.length > 0);
      })(),
    );
  }

  if (checks.length === 0) {
    logger.warn('customer service: no client-record sources configured, unknown sender cannot enroll', {
      instanceId: instance.id,
    });
    return false;
  }

  const results = await Promise.allSettled(checks);
  for (const r of results) {
    if (r.status === 'rejected') {
      logger.warn('customer service: client-record lookup failed during enrollment check', {
        instanceId: instance.id,
        reason: String(r.reason),
      });
    }
  }
  return results.some((r) => r.status === 'fulfilled' && r.value === true);
}
