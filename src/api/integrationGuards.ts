import type { RequestHandler } from 'express';
import { getFreshGoogleAccessToken } from './googleOauth.js';
import * as mondayOauthTokens from '../db/queries/mondayOauthTokens.js';

/**
 * Route guards for agent routers whose endpoints need a connected integration
 * account. Both answer 409 not_connected — the UI's cue to show the connect
 * button — and stash the token in res.locals for the handler.
 */

/** Requires a connected monday account; sets res.locals.mondayAccessToken. */
export const requireMondayToken: RequestHandler = async (req, res, next) => {
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

/** Requires a connected (and refreshable) Google account; sets res.locals.googleAccessToken. */
export const requireGoogleToken: RequestHandler = async (req, res, next) => {
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
