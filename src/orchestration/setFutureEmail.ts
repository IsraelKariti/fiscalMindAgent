import * as clients from '../db/queries/clients.js';
import * as emails from '../db/queries/emails.js';
import { buildMessages } from '../openai/prompt.js';
import { decide } from '../openai/decide.js';
import { scheduleDraftEmail } from './scheduleDraftEmail.js';
import { hoursToMs } from '../util/time.js';
import { logger } from '../util/logger.js';

/** Asks the LLM, given the full thread so far, whether the goal is complete or a follow-up is needed, and acts on it. */
export async function setFutureEmail(clientId: string): Promise<void> {
  const client = await clients.getById(clientId);
  if (!client) throw new Error(`setFutureEmail: client ${clientId} not found`);
  if (client.goal_status === 'complete') return;

  const history = await emails.listForClient(clientId);
  const messages = buildMessages(client, history, new Date());
  const decision = await decide(messages);

  if (decision.decision === 'goal_complete') {
    await clients.updateGoalStatus(clientId, 'complete');
    logger.info('goal complete', { clientId, reasoning: decision.reasoning });
    return;
  }

  await scheduleDraftEmail(clientId, {
    subject: decision.email_subject,
    body: decision.email_body,
    delayMs: hoursToMs(decision.wait_hours),
  });
  logger.info('follow-up scheduled', { clientId, wait_hours: decision.wait_hours, reasoning: decision.reasoning });
}
