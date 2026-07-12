import { env } from '../config/env.js';
import { logger } from '../util/logger.js';
import { isTwilioConfigured, twilioClient } from './client.js';

/**
 * The admin "buy number" flow needs, on top of the base Twilio credentials,
 * the WABA to register new senders under and the webhook URL to point them at.
 */
export function isProvisioningConfigured(): boolean {
  return isTwilioConfigured() && Boolean(env.TWILIO_WABA_ID) && Boolean(env.TWILIO_WEBHOOK_URL);
}

const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 60_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface ProvisionedSender {
  /** E.164 number of the purchased sender. */
  phoneNumber: string;
  /**
   * Twilio sender status when we stopped waiting: ONLINE = ready to message;
   * CREATING/OFFLINE = Meta registration still settling (it finishes on
   * Twilio's side regardless — the number is already assigned).
   */
  senderStatus: string;
}

/**
 * Buys a US local SMS-capable Twilio number and registers it as a WhatsApp
 * sender under the platform WABA. Ownership verification is automatic for
 * Twilio-hosted numbers, so there is no OTP step. If sender registration
 * fails, the just-purchased number is released so it isn't billed.
 */
export async function provisionWhatsAppNumber(friendlyName: string): Promise<ProvisionedSender> {
  const client = twilioClient();

  const [candidate] = await client.availablePhoneNumbers('US').local.list({ smsEnabled: true, limit: 1 });
  if (!candidate) throw new Error('Twilio has no US numbers available for purchase right now.');

  const purchased = await client.incomingPhoneNumbers.create({
    phoneNumber: candidate.phoneNumber,
    friendlyName,
  });
  logger.info('twilio number purchased', { phoneNumber: purchased.phoneNumber, sid: purchased.sid });

  try {
    // The generated SDK forwards this object verbatim as the JSON body, so the
    // keys must be the API's snake_case ones (its camelCase typings don't
    // match what the endpoint accepts).
    const body = {
      sender_id: `whatsapp:${purchased.phoneNumber}`,
      configuration: { waba_id: env.TWILIO_WABA_ID },
      webhook: { callback_url: env.TWILIO_WEBHOOK_URL, callback_method: 'POST' },
      profile: { name: env.TWILIO_WA_SENDER_NAME },
    };
    const senders = client.messaging.v2.channelsSenders;
    const created = await senders.create(body as unknown as Parameters<typeof senders.create>[0]);

    // CREATING -> (brief OFFLINE) -> ONLINE, typically within a minute.
    let status: string = created.status;
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (status !== 'ONLINE' && Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);
      status = (await senders(created.sid).fetch()).status;
    }
    logger.info('wa sender registered', { phoneNumber: purchased.phoneNumber, senderSid: created.sid, status });
    return { phoneNumber: purchased.phoneNumber, senderStatus: status };
  } catch (err) {
    await client
      .incomingPhoneNumbers(purchased.sid)
      .remove()
      .catch((releaseErr) => logger.error('failed to release number after sender registration error', releaseErr));
    throw err;
  }
}

export interface OwnedNumber {
  /** E.164 number. */
  phoneNumber: string;
  friendlyName: string;
  dateCreated: string;
}

/** Every number the Twilio account currently owns (and pays monthly rent for). */
export async function listOwnedNumbers(): Promise<OwnedNumber[]> {
  const numbers = await twilioClient().incomingPhoneNumbers.list();
  return numbers.map((n) => ({
    phoneNumber: n.phoneNumber,
    friendlyName: n.friendlyName,
    dateCreated: n.dateCreated.toISOString(),
  }));
}

/** The number isn't on this Twilio account, so there is nothing to release. */
export class NumberNotOwnedError extends Error {
  constructor(phoneNumber: string) {
    super(`${phoneNumber} is not owned by this Twilio account.`);
  }
}

/**
 * Permanently releases a number back to Twilio: deregisters its WhatsApp
 * sender (freeing the WABA slot), then releases the number itself, which stops
 * the monthly rental billing. The number goes back to Twilio's pool and cannot
 * be recovered.
 */
export async function releaseWhatsAppNumber(phoneNumber: string): Promise<void> {
  const client = twilioClient();

  const [owned] = await client.incomingPhoneNumbers.list({ phoneNumber, limit: 1 });
  if (!owned) throw new NumberNotOwnedError(phoneNumber);

  // The senders API has no per-number lookup, only a channel-wide list.
  const senders = await client.messaging.v2.channelsSenders.list({ channel: 'whatsapp' });
  const sender = senders.find((s) => s.senderId === `whatsapp:${owned.phoneNumber}`);
  if (sender) {
    await client.messaging.v2.channelsSenders(sender.sid).remove();
    logger.info('wa sender deregistered', { phoneNumber: owned.phoneNumber, senderSid: sender.sid });
  }

  await client.incomingPhoneNumbers(owned.sid).remove();
  logger.info('twilio number released', { phoneNumber: owned.phoneNumber, sid: owned.sid });
}
