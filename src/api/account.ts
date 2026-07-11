import { Router, type RequestHandler } from 'express';
import { claimMailbox, mailboxAvailability, mailboxStatus } from './mailbox.js';
import { mondayConnectionStatus, mondayConnectionUrl, mondayDisconnect } from './mondayOauth.js';
import { waSenderStatus } from './waAdmin.js';

/** Express 4 does not catch rejected async handlers; route errors through next() so they 500 instead of hanging. */
function wrap(handler: RequestHandler): RequestHandler {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

/**
 * Account-level routes shared by every agent: the accountant's sending
 * identities (mailbox, WhatsApp number). Mounted like the workspace router —
 * under both the cookie /api/* and monday /api/monday/app/* stacks — but not
 * agent-scoped.
 */
export const accountRouter = Router();

accountRouter.get('/mailbox', wrap(mailboxStatus));
accountRouter.get('/mailbox/availability', wrap(mailboxAvailability));
accountRouter.post('/mailbox', wrap(claimMailbox));
accountRouter.get('/wa-sender', wrap(waSenderStatus));
accountRouter.get('/monday-connection', wrap(mondayConnectionStatus));
accountRouter.get('/monday-connection/url', wrap(mondayConnectionUrl));
accountRouter.delete('/monday-connection', wrap(mondayDisconnect));
