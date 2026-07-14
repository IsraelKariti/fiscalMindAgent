import { sendToAccountant } from '../docCollector/notifyAccountant.js';
import { env } from '../../config/env.js';
import type { ClientDocumentRow, ClientRow } from '../../db/types.js';

/**
 * Unlike the doc collector's completion email, the accountant never defined the
 * list here — the agent determined it in the interview — so the email spells
 * out exactly which documents were collected.
 */
export async function sendGoalCompleteEmail(client: ClientRow, documents: ClientDocumentRow[]): Promise<void> {
  const subject = `כל מסמכי הדוח השנתי של ${client.name} התקבלו`;
  const list = documents.map((d) => `• ${d.name}${d.description ? ` — ${d.description}` : ''}`).join('\n');
  const body = [
    'שלום,',
    '',
    `חדשות טובות — הראיון עם הלקוח ${client.name} הושלם, וכל המסמכים שנקבעו בו לדוח השנתי התקבלו.`,
    '',
    'המסמכים שנאספו:',
    list || '• (לא נקבעו מסמכים)',
    '',
    'הסוכן סיים את הטיפול בלקוח ולא יישלחו עוד תזכורות.',
    '',
    `לצפייה בתיק הלקוח: ${env.APP_BASE_URL}`,
  ].join('\n');
  await sendToAccountant(client, subject, body);
}
