import twilio from 'twilio';
import { env } from '../config/env.js';

let cached: ReturnType<typeof twilio> | null = null;

export function isTwilioConfigured(): boolean {
  return Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN);
}

/** Lazily constructed so the web/worker/CLI can run without Twilio credentials. */
export function twilioClient(): ReturnType<typeof twilio> {
  if (!isTwilioConfigured()) {
    throw new Error('Twilio is not configured: set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.');
  }
  cached ??= twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  return cached;
}
