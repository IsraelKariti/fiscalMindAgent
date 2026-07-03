import { Router } from 'express';
import { verifyPubSubOidcToken } from './verifyPubSub.js';
import { onInboundEmail, type GmailPushPayload } from './onInboundEmail.js';
import { logger } from '../util/logger.js';

export const pubsubRoute = Router();

interface PubSubPushBody {
  message: { data: string; messageId: string };
  subscription: string;
}

pubsubRoute.post('/webhooks/gmail', verifyPubSubOidcToken, (req, res) => {
  // Ack immediately: processing includes a synchronous Gemini call that can take several
  // seconds, and the handler is already idempotent (historyId comparison + ON CONFLICT), so
  // there's no correctness benefit to holding the ack open or forcing Pub/Sub redelivery.
  res.status(200).end();

  const body = req.body as PubSubPushBody;
  try {
    const payload = JSON.parse(Buffer.from(body.message.data, 'base64').toString('utf8')) as GmailPushPayload;
    onInboundEmail(payload, body.message.messageId).catch((err) => {
      logger.error('onInboundEmail failed', err, { pubsubMessageId: body.message.messageId });
    });
  } catch (err) {
    logger.error('failed to parse Pub/Sub push payload', err);
  }
});
