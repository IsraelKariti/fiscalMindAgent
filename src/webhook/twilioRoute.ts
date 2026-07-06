import express, { Router } from 'express';
import twilio from 'twilio';
import { env } from '../config/env.js';
import { onInboundWhatsApp, type TwilioInboundParams } from './onInboundWhatsApp.js';
import { logger } from '../util/logger.js';

export const twilioRoute = Router();

/**
 * Inbound WhatsApp messages from Twilio (form-encoded POST). The signature is
 * an HMAC over the exact public URL plus the sorted POST params, so validation
 * uses TWILIO_WEBHOOK_URL (the ngrok/production URL Twilio was given), not
 * whatever host/path express reconstructs behind the proxy.
 */
twilioRoute.post('/webhooks/twilio', express.urlencoded({ extended: false }), (req, res) => {
  if (!env.TWILIO_AUTH_TOKEN || !env.TWILIO_WEBHOOK_URL) {
    res.status(503).json({ error: 'TWILIO_AUTH_TOKEN / TWILIO_WEBHOOK_URL are not configured.' });
    return;
  }

  const params = req.body as Record<string, string>;
  const signature = req.header('X-Twilio-Signature') ?? '';
  if (!twilio.validateRequest(env.TWILIO_AUTH_TOKEN, signature, env.TWILIO_WEBHOOK_URL, params)) {
    logger.warn('rejected Twilio webhook with bad signature', { messageSid: params.MessageSid });
    res.status(401).json({ error: 'Invalid webhook signature.' });
    return;
  }

  // Ack immediately with empty TwiML (no auto-reply): processing includes a
  // synchronous Gemini call, and the handler is idempotent (ON CONFLICT on the
  // MessageSid), so Twilio retries lose nothing.
  res.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response/>');

  // Status callbacks (delivered/read/failed) share the webhook shape but carry
  // MessageStatus and no content — v1 logs and ignores them.
  if (params.MessageStatus && !params.Body && !Number(params.NumMedia ?? '0')) {
    logger.info('twilio status callback', { messageSid: params.MessageSid, status: params.MessageStatus });
    return;
  }
  if (!params.MessageSid || !params.From || !params.To) {
    logger.warn('twilio webhook missing message fields, ignoring', { keys: Object.keys(params) });
    return;
  }

  onInboundWhatsApp(params as unknown as TwilioInboundParams).catch((err) => {
    logger.error('onInboundWhatsApp failed', err, { messageSid: params.MessageSid });
  });
});
