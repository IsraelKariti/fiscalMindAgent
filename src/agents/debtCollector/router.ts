import { Router, type RequestHandler } from 'express';
import { requireGoogleToken, requireMondayToken } from '../../api/integrationGuards.js';
import * as agentInstances from '../../db/queries/agentInstances.js';
import * as googleOauthTokens from '../../db/queries/googleOauthTokens.js';
import * as mondayOauthTokens from '../../db/queries/mondayOauthTokens.js';
import { getSpreadsheetMeta } from '../customerService/googleData.js';
import { EMAIL_CAPABLE, listBoards } from '../customerService/mondayData.js';
import { DebtCollectorSettingsSchema, parseSettings } from './settings.js';

/** Express 4 does not catch rejected async handlers; route errors through next() so they 500 instead of hanging. */
function wrap(handler: RequestHandler): RequestHandler {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
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
