import express, { Router } from 'express';
import { Webhook } from 'svix';
import { env } from '../config/env.js';
import { onInboundEmail, type ResendInboundData } from './onInboundEmail.js';
import { logger } from '../util/logger.js';

export const resendRoute = Router();

interface ResendWebhookEvent {
  type: string;
  created_at: string;
  data: ResendInboundData;
}

// Mounted before the app-wide express.json(): Svix signatures are computed
// over the raw body, so this route must see it unparsed.
resendRoute.post('/webhooks/resend', express.raw({ type: 'application/json' }), (req, res) => {
  if (!env.RESEND_WEBHOOK_SECRET) {
    res.status(503).json({ error: 'RESEND_WEBHOOK_SECRET is not configured.' });
    return;
  }

  let event: ResendWebhookEvent;
  try {
    event = new Webhook(env.RESEND_WEBHOOK_SECRET).verify(req.body as Buffer, {
      'svix-id': req.header('svix-id') ?? '',
      'svix-timestamp': req.header('svix-timestamp') ?? '',
      'svix-signature': req.header('svix-signature') ?? '',
    }) as ResendWebhookEvent;
  } catch (err) {
    logger.warn('rejected Resend webhook with bad signature', { err: String(err) });
    res.status(401).json({ error: 'Invalid webhook signature.' });
    return;
  }

  // Ack immediately: processing includes a synchronous Gemini call that can take
  // several seconds, and the handler is idempotent (ON CONFLICT on message_id),
  // so there's no correctness benefit to holding the ack open for Svix retries.
  res.status(200).end();

  if (event.type !== 'email.received') return;
  onInboundEmail(event.data).catch((err) => {
    logger.error('onInboundEmail failed', err, { emailId: event.data.email_id ?? event.data.id });
  });
});
