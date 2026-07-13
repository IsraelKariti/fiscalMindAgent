import * as users from '../../db/queries/users.js';
import { sendEmail } from '../../resend/send.js';
import { env } from '../../config/env.js';
import { logger } from '../../util/logger.js';
import type { ClientRow } from '../../db/types.js';
import type { DebtSnapshot } from './decisionSchema.js';

/**
 * Notifications from the platform to the accountant, sent from a no-reply
 * address on the verified sending domain (no mailbox needs to exist — Resend
 * authorizes the whole domain) to their login address. Deliberately NOT stored
 * in the emails table — that table is the client conversation. Callers fire
 * and forget; a notification failure must never fail planning.
 */
async function sendToAccountant(client: ClientRow, subject: string, body: string): Promise<void> {
  if (!client.user_id) {
    logger.warn('accountant notification skipped: legacy client without owner', { clientId: client.id });
    return;
  }
  const user = await users.getById(client.user_id);
  if (!user) {
    logger.warn('accountant notification skipped: missing user', { clientId: client.id, userId: client.user_id });
    return;
  }
  await sendEmail({ from: `FiscalMind <no-reply@${env.AGENT_EMAIL_DOMAIN}>`, to: user.email, subject, body });
  logger.info('accountant notified', { clientId: client.id, to: user.email, subject });
}

/** "The debt was collected" — sent once, when the client's payment is first confirmed. */
export async function sendDebtCollectedEmail(client: ClientRow, snapshot: DebtSnapshot): Promise<void> {
  const subject = `החוב של ${client.name} נגבה`;
  const details = [
    snapshot.amount ? `סכום החוב: ${snapshot.amount}` : null,
    snapshot.reason ? `סיבת החוב: ${snapshot.reason}` : null,
  ].filter((line): line is string => line !== null);
  const body = [
    'שלום,',
    '',
    `חדשות טובות — הלקוח ${client.name} אישר את תשלום החוב, והגבייה הושלמה.`,
    ...details,
    'הסוכן סיים את הטיפול בלקוח ולא יישלחו עוד תזכורות.',
    '',
    `לצפייה בתיק הלקוח: ${env.APP_BASE_URL}`,
  ].join('\n');
  await sendToAccountant(client, subject, body);
}
