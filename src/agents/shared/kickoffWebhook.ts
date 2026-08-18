import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';

/**
 * The monday kickoff webhook (manual-kickoff agents): the accountant pastes
 * this URL into a monday Webhooks-integration recipe on their board ("when
 * button clicked / status changes, send a webhook"), and the event starts the
 * agent's conversation with the clicked row's client.
 *
 * The URL carries a per-instance bearer token derived by HMAC from
 * SECRET_ENC_KEY — deliberately stateless: agent_instances.settings is
 * replaced wholesale by the accountant-facing settings PUT, so a stored token
 * would be lost on every save.
 */
export function kickoffWebhookToken(instanceId: string): string {
  return createHmac('sha256', env.SECRET_ENC_KEY).update(`monday-kickoff:${instanceId}`).digest('hex').slice(0, 32);
}

export function kickoffWebhookUrl(instanceId: string): string {
  return `${env.APP_BASE_URL}/webhooks/monday-kickoff/${instanceId}/${kickoffWebhookToken(instanceId)}`;
}

/** Timing-safe check of a presented token against the instance's derived one. */
export function verifyKickoffToken(instanceId: string, presented: string): boolean {
  const expected = Buffer.from(kickoffWebhookToken(instanceId));
  const given = Buffer.from(presented);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
