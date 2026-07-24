import * as users from '../../db/queries/users.js';
import { recordAudit } from '../../audit/audit.js';
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
  recordAudit({
    actorType: 'agent',
    action: 'email.accountant_sent',
    agentInstanceId: client.agent_instance_id,
    clientId: client.id,
    targetType: 'email',
    detail: { clientName: client.name, to: user.email, subject },
  });
}

/** "The client claims they paid — please confirm" — sent once, when the unverified claim is first seen. */
export async function sendDebtClaimEmail(client: ClientRow, snapshot: DebtSnapshot): Promise<void> {
  const subject = `הלקוח ${client.name} דיווח ששילם — נדרש אישורך`;
  const details = [
    snapshot.amount ? `סכום החוב לפי הנתונים: ${snapshot.amount}` : null,
    snapshot.reason ? `סיבת החוב: ${snapshot.reason}` : null,
  ].filter((line): line is string => line !== null);
  const body = [
    'שלום,',
    '',
    `הלקוח ${client.name} דיווח בהתכתבות ששילם את החוב, אך הנתונים הפיננסיים (הגיליון/הלוח) עדיין מציגים חוב פתוח.`,
    ...details,
    '',
    'הסוכן הפסיק לשלוח תזכורות וממתין לאישורך:',
    '• אם התשלום התקבל — אשרו את קבלתו בתיק הלקוח (לשונית "חוב"), או עדכנו את הגיליון/הלוח והסוכן יזהה זאת בעצמו.',
    '• אם התשלום לא התקבל — אפשר להפעיל את הסוכן מחדש מתוך תיק הלקוח.',
    '',
    `לצפייה בתיק הלקוח: ${env.APP_BASE_URL}`,
  ].join('\n');
  await sendToAccountant(client, subject, body);
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
