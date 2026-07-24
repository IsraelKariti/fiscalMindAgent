import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { requireGoogleToken, requireMondayToken } from '../../api/integrationGuards.js';
import * as agentInstances from '../../db/queries/agentInstances.js';
import * as clients from '../../db/queries/clients.js';
import * as googleOauthTokens from '../../db/queries/googleOauthTokens.js';
import * as mondayOauthTokens from '../../db/queries/mondayOauthTokens.js';
import { withClientLock } from '../../db/withClientLock.js';
import { recordAudit } from '../../audit/audit.js';
import { publishClientUpdated } from '../../events/clientEvents.js';
import { removeFutureEmail } from '../../orchestration/removeFutureEmail.js';
import { getSpreadsheetMeta } from '../customerService/googleData.js';
import { EMAIL_CAPABLE, listBoards } from '../customerService/mondayData.js';
import { readDebtSnapshot, type DebtSnapshot } from './decisionSchema.js';
import { DebtCollectorSettingsSchema, parseSettings } from './settings.js';

/** Express 4 does not catch rejected async handlers; route errors through next() so they 500 instead of hanging. */
function wrap(handler: RequestHandler): RequestHandler {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

/** Postgres rejects non-UUID ids with an error (→ 500); pre-validate so they 404 like other misses. */
function uuidParam(value: string | undefined): string | null {
  return value && z.string().uuid().safeParse(value).success ? value : null;
}

/**
 * The debt collector's settings + source-picker routes, composed into the
 * workspace router. Paths are prefixed /debt-collector to stay clear of the
 * shared workspace routes.
 */
export function buildRouter(): Router {
  const router = Router();

  // Bail out to the next agent type's router when this instance isn't ours.
  router.use((req, _res, next) => {
    if (req.agentInstance && req.agentInstance.agent_type !== 'debt_collector') {
      next('router');
      return;
    }
    next();
  });

  router.get(
    '/debt-collector/settings',
    wrap(async (req, res) => {
      const [mondayToken, googleToken] = await Promise.all([
        mondayOauthTokens.getByUserId(req.userId!),
        googleOauthTokens.getByUserId(req.userId!),
      ]);
      res.json({
        settings: parseSettings(req.agentInstance!.settings),
        mondayConnected: mondayToken !== null,
        googleConnected: googleToken !== null,
      });
    }),
  );

  router.put(
    '/debt-collector/settings',
    wrap(async (req, res) => {
      const parsed = DebtCollectorSettingsSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid settings.', details: parsed.error.flatten() });
        return;
      }
      const updated = await agentInstances.updateSettings(req.agentInstance!.id, parsed.data);
      if (!updated) {
        res.status(404).json({ error: 'Agent instance not found.' });
        return;
      }
      res.json({ settings: parseSettings(updated.settings) });
    }),
  );

  // The accountant confirms the client's unconfirmed payment claim (snapshot
  // status 'paid_claimed', set when the LLM saw payment evidence but the
  // financial rows still showed debt). Confirmation is the human half of the
  // two-step 'paid' flow: it completes the goal and cancels any pending send.
  router.post(
    '/debt-collector/clients/:id/confirm-paid',
    wrap(async (req, res) => {
      const id = uuidParam(req.params.id);
      const client = id ? await clients.getByIdForInstance(id, req.agentInstance!.id) : null;
      if (!client) {
        res.status(404).json({ error: 'Client not found.' });
        return;
      }
      const snapshot = readDebtSnapshot(client.agent_fields);
      if (!snapshot || snapshot.status !== 'paid_claimed') {
        res.status(409).json({ error: 'No unconfirmed payment claim for this client.' });
        return;
      }
      const confirmed: DebtSnapshot = {
        ...snapshot,
        status: 'paid',
        paid_confirmed_at: snapshot.paid_confirmed_at ?? new Date().toISOString(),
      };
      await clients.setDebtSnapshot(client.id, confirmed);
      await clients.updateGoalStatus(client.id, 'complete');
      await withClientLock(client.id, () => removeFutureEmail(client.id));
      publishClientUpdated(client.id);
      // realUserId over userId: while impersonating, the confirming human is the admin.
      recordAudit({
        actorType: 'accountant',
        action: 'debt.confirmed_paid',
        actorUserId: req.realUserId ?? req.userId ?? null,
        agentInstanceId: req.agentInstance!.id,
        clientId: client.id,
        detail: { clientName: client.name, amount: confirmed.amount },
      });
      res.json({ client: await clients.getById(client.id) });
    }),
  );

  router.get(
    '/debt-collector/monday/boards',
    wrap(requireMondayToken),
    wrap(async (_req, res) => {
      res.json({ boards: await listBoards(res.locals.mondayAccessToken as string, EMAIL_CAPABLE) });
    }),
  );

  /** Tabs + header columns of one picked spreadsheet — powers the email/name column mapping UI. */
  router.get(
    '/debt-collector/google/spreadsheets/:spreadsheetId/meta',
    wrap(requireGoogleToken),
    wrap(async (req, res) => {
      res.json({ meta: await getSpreadsheetMeta(res.locals.googleAccessToken as string, req.params.spreadsheetId!) });
    }),
  );

  return router;
}
