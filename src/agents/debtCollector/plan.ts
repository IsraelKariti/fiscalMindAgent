import * as clients from '../../db/queries/clients.js';
import * as documentFiles from '../../db/queries/documentFiles.js';
import * as emails from '../../db/queries/emails.js';
import * as llmUsage from '../../db/queries/llmUsage.js';
import { publishClientUpdated } from '../../events/clientEvents.js';
import { scheduleDraftMessage } from '../../orchestration/scheduleDraftEmail.js';
import { env } from '../../config/env.js';
import { zonedTimeToUtc } from '../../util/time.js';
import { logger } from '../../util/logger.js';
import type { AgentContext } from '../types.js';
import { loadDebtData } from './data.js';
import { decide } from './decide.js';
import { readDebtSnapshot, type DebtExtraction, type DebtSnapshot } from './decisionSchema.js';
import { sendDebtCollectedEmail } from './notifyAccountant.js';
import { buildPrompt } from './prompt.js';
import { parseSettings } from './settings.js';

function snapshotFrom(
  status: DebtSnapshot['status'],
  extraction: DebtExtraction,
  reasoning: string,
  analyzedAt: Date,
): DebtSnapshot {
  return {
    status,
    amount: extraction.debt_amount,
    reason: extraction.debt_reason,
    payment_plan: extraction.payment_plan,
    recurring_payments: extraction.recurring_payments,
    one_time_payments: extraction.one_time_payments,
    reasoning,
    analyzed_at: analyzedAt.toISOString(),
  };
}

/**
 * One planning step for one debt-collector client: re-read the accountant's
 * live sheets/boards, have the LLM extract the debt picture from the matched
 * rows plus the conversation, persist the snapshot for the workspace, and act —
 * complete silently (no debt), complete + notify the accountant (paid), or
 * schedule the next collection email. Fresh data every cycle by design: the
 * accountant clearing the row after payment is itself a signal.
 */
export async function planDebtCollection(ctx: AgentContext): Promise<void> {
  const { client, accountant } = ctx;
  const clientId = client.id;
  const now = new Date();

  const settings = parseSettings(ctx.instance?.settings ?? {});
  if (settings.boards.length === 0 && settings.sheets.length === 0) {
    // Surfaces as draft_failed_at → the Timeline offers Retry once sources are configured.
    throw new Error(`debt collector: no data sources configured for instance ${ctx.instance?.id}`);
  }

  const data = await loadDebtData(ctx, settings);
  if (data.failedSources.length >= data.configuredSources) {
    throw new Error(`debt collector: all configured sources failed for client ${clientId}: ${data.failedSources.join(', ')}`);
  }
  const matchedRows = [...data.boardRows, ...data.sheetRows].reduce((n, source) => n + source.rows.length, 0);
  if (matchedRows === 0) {
    // No financial row for this email — record why the agent can't act, then
    // fail the attempt so the accountant sees Retry (fix the sheet, retry).
    await clients.setDebtSnapshot(clientId, {
      status: 'no_data',
      amount: null,
      reason: null,
      payment_plan: 'unknown',
      recurring_payments: null,
      one_time_payments: null,
      reasoning: `לא נמצאה שורה עם האימייל ${client.email_address} באף מקור נתונים מוגדר`,
      analyzed_at: now.toISOString(),
    } satisfies DebtSnapshot);
    publishClientUpdated(clientId);
    throw new Error(`debt collector: no financial rows matched client ${clientId} (${client.email_address})`);
  }

  const history = await emails.listForClient(clientId);
  const files = await documentFiles.listForClient(clientId);
  const { systemInstruction, contents } = buildPrompt(client, accountant, data, history, files, now);
  const { decision, usage, model } = await decide(systemInstruction, contents);

  // Bill the tokens to the owning accountant right away, so they count even if
  // acting on the decision fails below.
  if (client.user_id) {
    await llmUsage.add(client.user_id, model, usage);
  }

  const previous = readDebtSnapshot(client.agent_fields);

  if (decision.decision !== 'follow_up') {
    if (decision.decision === 'no_debt') {
      await clients.setDebtSnapshot(clientId, snapshotFrom('no_debt', decision.extraction, decision.reasoning, now));
      await clients.updateGoalStatus(clientId, 'complete');
      publishClientUpdated(clientId);
      // Silent completion by design: no client email, no accountant email — the
      // workspace shows the snapshot's reasoning.
      logger.info('debt collector: no open debt, completing silently', { clientId, reasoning: decision.reasoning });
      return;
    }

    const snapshot = snapshotFrom('paid', decision.extraction, decision.reasoning, now);
    // First confirmation wins; kept across later re-writes as the notification's idempotency key.
    snapshot.paid_confirmed_at = previous?.paid_confirmed_at ?? now.toISOString();
    await clients.setDebtSnapshot(clientId, snapshot);
    await clients.updateGoalStatus(clientId, 'complete');
    publishClientUpdated(clientId);
    logger.info('debt collector: payment confirmed, goal complete', { clientId, reasoning: decision.reasoning });
    if (!previous?.paid_confirmed_at) {
      // Fire-and-forget: a notification failure must never fail planning.
      sendDebtCollectedEmail(client, snapshot).catch((err) =>
        logger.error('debt-collected notification failed', err, { clientId }),
      );
    }
    return;
  }

  await clients.setDebtSnapshot(clientId, snapshotFrom('in_debt', decision.extraction, decision.reasoning, now));
  publishClientUpdated(clientId);

  // The LLM answers with a wall-clock datetime in the accountant's timezone.
  const sendAtUtc = zonedTimeToUtc(decision.send_at, env.ACCOUNTANT_TIMEZONE);
  const delayMs = sendAtUtc.getTime() - Date.now();
  if (delayMs < 0) {
    logger.warn('LLM send_at is in the past; sending immediately', { clientId, send_at: decision.send_at });
  }
  await scheduleDraftMessage(clientId, {
    channel: 'email',
    subject: decision.subject,
    body: decision.body,
    delayMs: Math.max(0, delayMs),
    reasoning: decision.reasoning,
  });
  logger.info('debt follow-up scheduled', {
    clientId,
    send_at: decision.send_at,
    send_at_utc: sendAtUtc.toISOString(),
    reasoning: decision.reasoning,
  });
}
