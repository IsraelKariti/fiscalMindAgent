import { env } from '../config/env.js';
import { logger } from '../util/logger.js';
import { isTwilioConfigured, twilioClient } from './client.js';

/**
 * The admin "buy number" flow needs, on top of the base Twilio credentials,
 * a WABA to register new senders under (the accountant's own connected WABA
 * counts) and the webhook URL to point them at.
 */
export function isProvisioningConfigured(hasOwnWaba = false): boolean {
  return isTwilioConfigured() && (hasOwnWaba || Boolean(env.TWILIO_WABA_ID)) && Boolean(env.TWILIO_WEBHOOK_URL);
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
 * sender under the given WABA — the accountant's own connected WABA
 * (wa_business_accounts) when they have one, else the platform WABA
 * (TWILIO_WABA_ID). Ownership verification is automatic for Twilio-hosted
 * numbers, so there is no OTP step. If sender registration fails, the
 * just-purchased number is released so it isn't billed.
 */
export async function provisionWhatsAppNumber(friendlyName: string, wabaId?: string): Promise<ProvisionedSender> {
  const targetWabaId = wabaId ?? env.TWILIO_WABA_ID;
  if (!targetWabaId) throw new Error('No WABA to register the sender under (connect one or set TWILIO_WABA_ID).');
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
      configuration: { waba_id: targetWabaId },
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

export interface WaSenderLiveStatus {
  /** Twilio sender status: ONLINE (deliverable), CREATING, OFFLINE — or UNREGISTERED when no sender exists for the number. */
  status: string;
  /** Meta's explanation while OFFLINE (e.g. 63104 WABA number limit); empty otherwise. */
  offlineReasons: { code: string; message: string }[];
}

/**
 * The number's real WhatsApp registration state on Twilio. A number can be
 * assigned to an agent while its sender is OFFLINE (Meta registration failed
 * after provisioning "succeeded") — every send from it is rejected until it
 * comes ONLINE, so the admin UI must show this state, not the assignment.
 */
export async function getSenderLiveStatus(phoneNumber: string): Promise<WaSenderLiveStatus> {
  // The senders API has no per-number lookup, only a channel-wide list.
  const senders = await twilioClient().messaging.v2.channelsSenders.list({ channel: 'whatsapp' });
  const sender = senders.find((s) => s.senderId === `whatsapp:${phoneNumber}`);
  if (!sender) return { status: 'UNREGISTERED', offlineReasons: [] };
  const reasons = (sender.offlineReasons ?? []) as { code?: string; message?: string }[];
  return {
    status: sender.status,
    offlineReasons: reasons.map((r) => ({ code: r.code ?? '', message: r.message ?? '' })),
  };
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

/**
 * After a number is unassigned from an agent, rewrite its Twilio friendly name
 * so the available-numbers pool doesn't keep showing the old agent's label.
 * Best-effort: does nothing when Twilio isn't configured or the number isn't
 * owned by this account (manually assigned external numbers), and swallows
 * failures — unassignment must not fail over a cosmetic rename.
 */
export async function markNumberAsPooled(phoneNumber: string): Promise<void> {
  if (!isTwilioConfigured()) return;
  try {
    const client = twilioClient();
    const [owned] = await client.incomingPhoneNumbers.list({ phoneNumber, limit: 1 });
    if (!owned) return;
    await client.incomingPhoneNumbers(owned.sid).update({ friendlyName: 'fiscalmind pool' });
    logger.info('twilio number renamed to pool', { phoneNumber });
  } catch (err) {
    logger.error('failed to rename unassigned twilio number', err);
  }
}

/**
 * Points an already-registered sender's inbound webhook at this environment.
 * Prod and dev share one Twilio account, so a pool number keeps the callback
 * URL of whichever environment originally provisioned it — assigning it to an
 * agent must therefore also claim its inbound traffic. No-op when Twilio isn't
 * configured or the number has no sender on this account (externally
 * registered numbers).
 */
export async function claimSenderWebhook(phoneNumber: string): Promise<void> {
  if (!isTwilioConfigured() || !env.TWILIO_WEBHOOK_URL) return;
  const client = twilioClient();
  // The senders API has no per-number lookup, only a channel-wide list.
  const senders = await client.messaging.v2.channelsSenders.list({ channel: 'whatsapp' });
  const sender = senders.find((s) => s.senderId === `whatsapp:${phoneNumber}`);
  if (!sender) return;
  if (sender.webhook?.callbackUrl === env.TWILIO_WEBHOOK_URL) return;
  // Same snake_case caveat as in provisionWhatsAppNumber: the SDK forwards
  // this object verbatim as the JSON body.
  const body = { webhook: { callback_url: env.TWILIO_WEBHOOK_URL, callback_method: 'POST' } };
  const handle = client.messaging.v2.channelsSenders(sender.sid);
  await handle.update(body as unknown as Parameters<typeof handle.update>[0]);
  logger.info('wa sender webhook claimed', { phoneNumber, callbackUrl: env.TWILIO_WEBHOOK_URL });
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
