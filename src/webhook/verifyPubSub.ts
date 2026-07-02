import type { Request, Response, NextFunction } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env.js';
import { logger } from '../util/logger.js';

const oidcClient = new OAuth2Client();

/**
 * Verifies the request really came from the Pub/Sub push subscription, via the OIDC bearer
 * token Pub/Sub attaches when the subscription is configured with --push-auth-service-account.
 */
export async function verifyPubSubOidcToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.header('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;
  if (!token) {
    res.status(401).end();
    return;
  }

  try {
    const ticket = await oidcClient.verifyIdToken({ idToken: token, audience: env.PUBSUB_PUSH_AUDIENCE });
    const payload = ticket.getPayload();
    if (!payload || payload.iss !== 'https://accounts.google.com') {
      throw new Error(`unexpected issuer: ${payload?.iss}`);
    }
    next();
  } catch (err) {
    logger.warn('rejected webhook request with invalid Pub/Sub OIDC token', { err: (err as Error).message });
    res.status(401).end();
  }
}
