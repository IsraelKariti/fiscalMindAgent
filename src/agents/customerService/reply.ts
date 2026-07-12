import * as clients from '../../db/queries/clients.js';
import * as emails from '../../db/queries/emails.js';
import * as llmUsage from '../../db/queries/llmUsage.js';
import * as mondayOauthTokens from '../../db/queries/mondayOauthTokens.js';
import * as waSenders from '../../db/queries/waSenders.js';
import { publishClientUpdated } from '../../events/clientEvents.js';
import { sendWhatsAppText } from '../../twilio/send.js';
import { logger } from '../../util/logger.js';
import type { AgentContext } from '../types.js';
import { generateAnswer } from './answer.js';
import { fetchDocsText, fetchRowsByPhone } from './mondayData.js';
import { buildPrompt, type KnowledgeContext } from './prompt.js';
import { parseSettings } from './settings.js';

/** Sent instead of silence when answer generation itself failed. */
const FALLBACK_ANSWER = 'מצטערים, לא הצלחנו לטפל בפנייתך כרגע. נסו שוב מאוחר יותר או פנו למשרד ישירות.';

/**
 * Fetches everything live from monday for this reply. Each source fails
 * independently into failedSources — a monday outage degrades the answer, it
 * doesn't silence the agent.
 */
async function loadKnowledge(ctx: AgentContext, waPhone: string): Promise<KnowledgeContext> {
  const settings = parseSettings(ctx.instance!.settings);
  const knowledge: KnowledgeContext = { docs: [], boardRows: [], failedSources: [] };
  if (settings.docIds.length === 0 && settings.boards.length === 0) return knowledge;

  const token = await mondayOauthTokens.getByUserId(ctx.accountant!.id);
  if (!token) {
    logger.warn('customer service: monday sources configured but no token, answering without them', {
      instanceId: ctx.instance!.id,
    });
    knowledge.failedSources.push('monday (not connected)');
    return knowledge;
  }

  const [docsResult, ...boardResults] = await Promise.allSettled([
    fetchDocsText(token.access_token, settings.docIds),
    ...settings.boards.map((board) => fetchRowsByPhone(token.access_token, board.boardId, board.phoneColumnId, waPhone)),
  ]);

  if (docsResult.status === 'fulfilled') knowledge.docs = docsResult.value;
  else if (settings.docIds.length > 0) {
    logger.warn('customer service: workdocs fetch failed', { reason: String(docsResult.reason) });
    knowledge.failedSources.push('office knowledge documents');
  }
  boardResults.forEach((result, i) => {
    if (result.status === 'fulfilled') knowledge.boardRows.push(result.value);
    else {
      logger.warn('customer service: board fetch failed', {
        boardId: settings.boards[i]?.boardId,
        reason: String(result.reason),
      });
      knowledge.failedSources.push(`client records board ${settings.boards[i]?.boardName ?? settings.boards[i]?.boardId}`);
    }
  });
  return knowledge;
}

/** Persist + send in the worker's markSent order, so the reply shows in the timeline. */
async function persistAndSend(clientId: string, from: string, to: string, body: string, reasoning: string | null): Promise<void> {
  const draft = await emails.insertDraft(clientId, { channel: 'whatsapp', subject: '', body, reasoning });
  // A Twilio failure leaves the row in 'draft' status (the established
  // pattern) — visible in the DB, never re-sent.
  const { sid } = await sendWhatsAppText({ from, to, body });
  await emails.markSent(draft.id, { messageId: sid, sentAt: new Date() });
}

/**
 * The whole customer-service turn: runs synchronously off the inbound webhook
 * (under the client lock), fetches monday knowledge live, generates one
 * answer, sends it. No 24h-window check — the inbound message just opened it.
 */
export async function replyToInbound(ctx: AgentContext): Promise<void> {
  // Reload: the webhook's opt-out handling may have flipped wa_enabled for
  // this very message — an opted-out client gets silence, not a reply.
  const client = await clients.getById(ctx.client.id);
  if (!client || !client.wa_enabled || !client.wa_phone) {
    logger.info('customer service: client not whatsapp-reachable, not replying', { clientId: ctx.client.id });
    return;
  }
  // CS has no goal; 'pending' (e.g. a manually created client) would trip the
  // dashboard's drafting machinery.
  if (client.goal_status === 'pending') await clients.updateGoalStatus(client.id, 'complete');

  const sender = ctx.instance ? await waSenders.getByInstanceId(ctx.instance.id) : null;
  if (!sender) {
    logger.warn('customer service: instance has no wa sender, cannot reply', { instanceId: ctx.instance?.id });
    return;
  }

  try {
    const knowledge = await loadKnowledge(ctx, client.wa_phone);
    const history = await emails.listForClient(client.id);
    const prompt = buildPrompt(client, ctx.accountant, history, knowledge);
    const result = await generateAnswer(prompt.systemInstruction, prompt.contents);
    await llmUsage.add(ctx.accountant!.id, result.model, result.usage);
    await persistAndSend(client.id, sender.phone_number, client.wa_phone, result.answer, result.reasoning);
  } catch (err) {
    // Generation failed after retries — a short static apology beats silence.
    logger.error('customer service: answer generation failed, sending fallback', err, { clientId: client.id });
    try {
      await persistAndSend(client.id, sender.phone_number, client.wa_phone, FALLBACK_ANSWER, 'fallback: generation failed');
    } catch (sendErr) {
      logger.error('customer service: fallback send failed', sendErr, { clientId: client.id });
    }
  }
  publishClientUpdated(client.id);
}
