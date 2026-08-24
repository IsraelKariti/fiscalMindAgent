import { Router, type RequestHandler } from 'express';
import { isDocCollectorFamily } from '../agents/docCollector/family.js';
import { getAgentTypeIfKnown } from '../agents/registry.js';
import { isKillSwitchOn } from '../agents/killSwitch.js';
import { parseSettings as parseDocCollectorSettings } from '../agents/docCollector/settings.js';
import { scanClientImportInstance } from '../agents/shared/clientImportScan.js';
import { verifyKickoffToken } from '../agents/shared/kickoffWebhook.js';
import { MONDAY_STATUS_AGENT_WORKING, syncMondayStatus } from '../agents/shared/mondayStatusSync.js';
import { resolveDeclarationClient, type DeclarationIntake } from '../agents/declarationOfCapital/kickoff.js';
import { applyFormIntake } from '../agents/declarationOfCapital/formIntake.js';
import { fetchBoardItemCells } from '../agents/customerService/mondayData.js';
import { normalizeE164 } from '../util/phone.js';
import { draftFirstEmail } from '../api/draftFirstEmail.js';
import { recordAudit } from '../audit/audit.js';
import * as agentInstances from '../db/queries/agentInstances.js';
import * as clients from '../db/queries/clients.js';
import * as emails from '../db/queries/emails.js';
import * as mondayOauthTokens from '../db/queries/mondayOauthTokens.js';
import { publishClientUpdated } from '../events/clientEvents.js';
import { logger } from '../util/logger.js';
import type { AgentInstanceRow } from '../db/types.js';

/** Express 4 does not catch rejected async handlers; route errors through next() so they 500 instead of hanging. */
function wrap(handler: RequestHandler): RequestHandler {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The accountant's board-side conversation trigger (manual-kickoff agents,
 * today the declaration-of-capital collector): a monday Webhooks-integration
 * recipe on the client board ("when button clicked / status changes, send a
 * webhook") POSTs here, and the event starts the agent's outreach to the
 * clicked row's client — the one place a manual-kickoff client's first message
 * gets drafted and scheduled.
 *
 * Deliberately event-type-agnostic: any monday event carrying the item id
 * works, so the accountant may wire a button column, a status column, or any
 * other recipe. The guards make double-fires harmless: only a paused,
 * never-contacted client is started; anything else is acknowledged and ignored
 * (200 — a non-2xx would make monday retry and eventually drop the webhook).
 */
export const mondayKickoffRoute = Router();

mondayKickoffRoute.post(
  '/webhooks/monday-kickoff/:instanceId/:token',
  wrap(async (req, res) => {
    const { instanceId, token } = req.params as { instanceId: string; token: string };
    if (!UUID_SHAPE.test(instanceId) || !verifyKickoffToken(instanceId, token)) {
      res.status(404).json({ error: 'Not found.' });
      return;
    }

    // monday verifies a newly added webhook URL by posting a challenge to echo.
    const body = (req.body ?? {}) as { challenge?: unknown; event?: Record<string, unknown> };
    if (typeof body.challenge === 'string') {
      res.json({ challenge: body.challenge });
      return;
    }

    const instance = await agentInstances.getById(instanceId);
    if (!instance || !instance.enabled || getAgentTypeIfKnown(instance.agent_type)?.manualKickoff !== true) {
      res.status(404).json({ error: 'Not found.' });
      return;
    }
    if (await isKillSwitchOn()) {
      logger.warn('monday kickoff: platform kill switch on, ignoring', { instanceId });
      res.json({ ok: true, started: false });
      return;
    }

    const itemId = body.event?.pulseId ?? body.event?.itemId;
    const boardId = body.event?.boardId;
    if ((typeof itemId !== 'number' && typeof itemId !== 'string') || (typeof boardId !== 'number' && typeof boardId !== 'string')) {
      logger.warn('monday kickoff: event carries no item/board id, ignoring', { instanceId, eventType: body.event?.type });
      res.json({ ok: true, started: false });
      return;
    }

    const started = await startClientForItem(instance, String(boardId), String(itemId));
    res.json({ ok: true, started });
  }),
);

/** Resolves the board row to the instance's client (enrolling it first if needed) and starts the conversation. */
async function startClientForItem(instance: AgentInstanceRow, boardId: string, itemId: string): Promise<boolean> {
  const log = { instanceId: instance.id, boardId, itemId };

  // The board must be one of the instance's configured client sources — its
  // mapping tells us which column holds the row's key (the client email, or
  // the phone number for WhatsApp-only agents).
  const settings = isDocCollectorFamily(instance.agent_type) ? parseDocCollectorSettings(instance.settings) : null;
  const board = settings?.boards.find((b) => b.boardId === boardId);
  if (!board) {
    logger.warn('monday kickoff: board is not a configured client source, ignoring', log);
    return false;
  }
  const whatsappOnly = getAgentTypeIfKnown(instance.agent_type)?.whatsappOnly === true;

  const mondayToken = await mondayOauthTokens.getByUserId(instance.user_id);
  if (!mondayToken) {
    logger.warn('monday kickoff: accountant has no monday connection', log);
    return false;
  }

  // Declaration-of-capital link flow: the row carries no phone — the client's
  // identity is resolved by following the row's connect-boards links (CRM item
  // for phone/name/ת"ז, questionnaire item for the form answers), enrolling
  // on the spot with the row's own declaration year.
  let client: Awaited<ReturnType<typeof clients.getById>> = null;
  let intake: DeclarationIntake | null = null;
  let waPhone: string | null = null;
  let email = '';
  if (board.crmLinkColumnId) {
    intake = await resolveDeclarationClient(instance, board, itemId, mondayToken.access_token);
    if (!intake) return false;
    client = intake.client;
    waPhone = client.wa_phone;
  } else {
    const cells = await fetchBoardItemCells(mondayToken.access_token, itemId);
    email = (board.emailColumnId ? (cells?.[board.emailColumnId] ?? '') : '').trim().toLowerCase();
    waPhone = normalizeE164((board.phoneColumnId ? (cells?.[board.phoneColumnId] ?? '') : '').trim());
    if (whatsappOnly ? !waPhone : !email) {
      logger.warn(`monday kickoff: item has no usable ${whatsappOnly ? 'phone' : 'email'} cell, ignoring`, log);
      return false;
    }

    // A row added after the last sweep may not be enrolled yet — the click also
    // serves as its import (narrowed to this board; manual-kickoff enrollment
    // creates the client paused, which is exactly the state started below).
    const lookup = () =>
      whatsappOnly
        ? clients.getByWaPhoneForInstance(instance.id, waPhone!)
        : clients.getByEmailAddressForInstance(instance.id, email);
    client = await lookup();
    if (!client) {
      await scanClientImportInstance(instance, { boardId });
      client = await lookup();
      if (!client) {
        logger.warn('monday kickoff: row could not be enrolled (missing key column / sender not assigned?)', log);
        return false;
      }
    }
  }

  // The click pins down which board row is this client — remember it (even for
  // clients that predate the status sync or are already running) so progress
  // labels can be written back to the row.
  await clients
    .setMondayItem(client.id, boardId, itemId)
    .catch((err) => logger.error('monday kickoff: storing item id failed', err, { ...log, clientId: client.id }));

  // Only a never-contacted, waiting client is started: an open goal, still
  // paused (imports create manual-kickoff clients paused), with no messages.
  // Repeat clicks, started conversations and deliberately re-paused clients
  // all land here and are left alone.
  if (client.goal_status !== 'pending' || !client.paused || (await emails.listForClient(client.id)).length > 0) {
    logger.info('monday kickoff: client not in a startable state, ignoring', { ...log, clientId: client.id });
    return false;
  }

  await clients.setPaused(client.id, false);
  recordAudit({
    actorType: 'accountant',
    actorUserId: instance.user_id,
    action: 'client.kickoff_triggered',
    agentInstanceId: instance.id,
    clientId: client.id,
    detail: {
      clientName: client.name,
      ...(whatsappOnly ? { waPhone } : { email }),
      boardId,
      itemId,
      source: 'monday_webhook',
    },
  });
  publishClientUpdated(client.id);
  // Form pre-resolution (declaration of capital): map the submitted
  // questionnaire's answers onto the checklist BEFORE the first draft is
  // planned, so the opening interview only asks what the form left open. A
  // failure here degrades gracefully — the interview covers everything.
  if (intake && intake.formAnswers.length > 0) {
    try {
      await applyFormIntake(client, intake.formAnswers, intake.taxYear);
    } catch (err) {
      logger.error('monday kickoff: form intake failed — falling back to the full interview', err, {
        ...log,
        clientId: client.id,
      });
    }
  }
  // Same fire-and-forget first-draft path as manual client creation.
  draftFirstEmail(client.id);
  // Report the start back to the board row's status column (fire-and-forget).
  void syncMondayStatus(client.id, MONDAY_STATUS_AGENT_WORKING);
  logger.info('monday kickoff: conversation started', { ...log, clientId: client.id });
  return true;
}
