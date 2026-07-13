import * as users from '../../db/queries/users.js';
import * as agentMailboxes from '../../db/queries/agentMailboxes.js';
import { sendEmail } from '../../resend/send.js';
import { env } from '../../config/env.js';
import { logger } from '../../util/logger.js';
import type { ClientRow } from '../../db/types.js';

/**
 * Notifications from the agent to its own accountant, sent from the
 * accountant's agent mailbox to their login address. Deliberately NOT stored
 * in the emails table — that table is the client conversation (it feeds the
 * timeline, the LLM transcript and the threading headers). Callers fire and
 * forget; a notification failure must never fail planning or a route.
 */
async function sendToAccountant(client: ClientRow, subject: string, body: string): Promise<void> {
  if (!client.user_id) {
    logger.warn('accountant notification skipped: legacy client without owner', { clientId: client.id });
    return;
  }
  const [user, mailbox] = await Promise.all([
    users.getById(client.user_id),
    agentMailboxes.getByUserId(client.user_id),
  ]);
  if (!user || !mailbox) {
    logger.warn('accountant notification skipped: missing user or mailbox', {
      clientId: client.id,
      userId: client.user_id,
    });
    return;
  }
  await sendEmail({ from: mailbox.email_address, to: user.email, subject, body });
  logger.info('accountant notified', { clientId: client.id, to: user.email, subject });
}

export async function sendGoalCompleteEmail(client: ClientRow): Promise<void> {
  const subject = `כל המסמכים של ${client.name} התקבלו`;
  const body = [
    'שלום,',
    '',
    `חדשות טובות — כל המסמכים הנדרשים מהלקוח ${client.name} התקבלו, ואיסוף המסמכים הושלם.`,
    'הסוכן סיים את הטיפול בלקוח ולא יישלחו עוד תזכורות.',
    '',
    `לצפייה בתיק הלקוח: ${env.APP_BASE_URL}`,
  ].join('\n');
  await sendToAccountant(client, subject, body);
}

export async function sendOverdueEmail(client: ClientRow, missingDocNames: string[]): Promise<void> {
  const dueDate = typeof client.agent_fields['due_date'] === 'string' ? (client.agent_fields['due_date'] as string) : '';
  const missing = missingDocNames.map((name) => `• ${name}`).join('\n');
  const subject = `תאריך היעד של ${client.name} עבר — הסוכן הפסיק לשלוח תזכורות`;
  const body = [
    'שלום,',
    '',
    `תאריך היעד לאיסוף המסמכים מהלקוח ${client.name} (${dueDate}) עבר, ועדיין חסרים המסמכים הבאים:`,
    missing || '• (לא הוגדרו מסמכים)',
    '',
    'הסוכן הפסיק לשלוח תזכורות והלקוח הועבר לטיפולך.',
    'כדי שהסוכן ימשיך לעקוב אפשר לחדש את הפעילות מתוך תיק הלקוח, או לעדכן את תאריך היעד.',
    '',
    `לצפייה בתיק הלקוח: ${env.APP_BASE_URL}`,
  ].join('\n');
  await sendToAccountant(client, subject, body);
}
