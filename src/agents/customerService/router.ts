import { Router, type RequestHandler } from 'express';
import { getFreshGoogleAccessToken } from '../../api/googleOauth.js';
import * as agentInstances from '../../db/queries/agentInstances.js';
import * as googleOauthTokens from '../../db/queries/googleOauthTokens.js';
import * as mondayOauthTokens from '../../db/queries/mondayOauthTokens.js';
import { getSpreadsheetMeta } from './googleData.js';
import { listBoards, listDocs } from './mondayData.js';
import { CustomerServiceSettingsSchema, parseSettings } from './settings.js';

/** Express 4 does not catch rejected async handlers; route errors through next() so they 500 instead of hanging. */
function wrap(handler: RequestHandler): RequestHandler {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

/**
 * The customer-service agent's settings + monday-picker routes, composed into
 * the workspace router (so they serve both the cookie /api/* and the monday
 * /api/monday/app/* mounts). Paths are prefixed /customer-service to stay
 * clear of the shared workspace routes.
 */
export function buildRouter(): Router {
  const router = Router();

  // Bail out to the next agent type's router when this instance isn't ours.
  router.use((req, _res, next) => {
    if (req.agentInstance && req.agentInstance.agent_type !== 'customer_service') {
      next('router');
      return;
    }
    next();
  });

  router.get(
    '/customer-service/settings',
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
    '/customer-service/settings',
    wrap(async (req, res) => {
      const parsed = CustomerServiceSettingsSchema.safeParse(req.body);
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

  /** Requires a connected monday account; 409 tells the UI to show the connect button. */
  const requireMondayToken: RequestHandler = async (req, res, next) => {
    try {
      const token = await mondayOauthTokens.getByUserId(req.userId!);
      if (!token) {
        res.status(409).json({ error: 'monday is not connected.', code: 'not_connected' });
        return;
      }
      res.locals.mondayAccessToken = token.access_token;
      next();
    } catch (err) {
      next(err);
    }
  };

  router.get(
    '/customer-service/monday/docs',
    wrap(requireMondayToken),
    wrap(async (_req, res) => {
      res.json({ docs: await listDocs(res.locals.mondayAccessToken as string) });
    }),
  );

  router.get(
    '/customer-service/monday/boards',
    wrap(requireMondayToken),
    wrap(async (_req, res) => {
      res.json({ boards: await listBoards(res.locals.mondayAccessToken as string) });
    }),
  );

  /** Requires a connected (and refreshable) Google account; 409 tells the UI to show the connect button. */
  const requireGoogleToken: RequestHandler = async (req, res, next) => {
    try {
      const token = await getFreshGoogleAccessToken(req.userId!);
      if (!token) {
        res.status(409).json({ error: 'Google is not connected.', code: 'not_connected' });
        return;
      }
      res.locals.googleAccessToken = token;
      next();
    } catch (err) {
      // GoogleAuthError = dead grant; anything else bubbles to the 500 handler.
      if ((err as Error).name === 'GoogleAuthError') {
        res.status(409).json({ error: 'Google is not connected.', code: 'not_connected' });
        return;
      }
      next(err);
    }
  };

  /** Tabs + header columns of one picked spreadsheet — powers the phone/name column mapping UI. */
  router.get(
    '/customer-service/google/spreadsheets/:spreadsheetId/meta',
    wrap(requireGoogleToken),
    wrap(async (req, res) => {
      res.json({ meta: await getSpreadsheetMeta(res.locals.googleAccessToken as string, req.params.spreadsheetId!) });
    }),
  );

  return router;
}
