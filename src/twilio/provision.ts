import { env } from '../config/env.js';
import { logger } from '../util/logger.js';
import { isTwilioConfigured, twilioClient } from './client.js';
import { buildSenderCreateBody, planSenderUpdate } from './senderProfile.js';
import { POOL_LABEL } from './numberOwnership.js';

/**
 * The picture URL callers pass in (`pictureUrl`) is the instance's effective
 * picture from src/storage/logos.ts (agent icon, app logo, built-in default),
 * already reduced to undefined when it is not a public https URL — Meta
 * fetches the image itself, so a localhost URL would only make the Twilio
 * call fail. The caller logs the skip; here undefined simply means "no logo".
 */

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

/** Twilio number types the purchase may search, in order. */
export type NumberType = 'mobile' | 'local';

/**
 * The ordered number types `provisionWhatsAppNumber` searches for a country.
 * Mobile first: Twilio sells Israel (the default TWILIO_NUMBER_COUNTRY) only
 * as mobile numbers. Local second so countries with no mobile inventory on
 * Twilio (the US) still resolve to the local numbers the platform bought
 * before. Pure, so the order is unit-tested without Twilio.
 */
export function numberSearchPlan(country: string): { country: string; types: NumberType[] } {
  return { country, types: ['mobile', 'local'] };
}

/**
 * Buys an SMS-capable Twilio number in TWILIO_NUMBER_COUNTRY (Israel by
 * default; see numberSearchPlan for the type order) and registers it as a
 * WhatsApp sender under the given WABA — the accountant's own connected WABA
 * (wa_business_accounts) when they have one, else the platform WABA
 * (TWILIO_WABA_ID), with `displayName` as the WhatsApp display name the admin
 * chose in the buy step (Meta reviews it; it is never changed afterwards).
 * Ownership verification is automatic for Twilio-hosted numbers, so there is
 * no OTP step. If sender registration fails, the just-purchased number is
 * released so it isn't billed.
 */
export async function provisionWhatsAppNumber(
  friendlyName: string,
  wabaId: string | undefined,
  pictureUrl: string | undefined,
  displayName: string,
): Promise<ProvisionedSender> {
  const targetWabaId = wabaId ?? env.TWILIO_WABA_ID;
  if (!targetWabaId) throw new Error('No WABA to register the sender under (connect one or set TWILIO_WABA_ID).');
  const client = twilioClient();

  const plan = numberSearchPlan(env.TWILIO_NUMBER_COUNTRY);
  const available = client.availablePhoneNumbers(plan.country);
  const search = { smsEnabled: true, limit: 1 };
  let candidate: { phoneNumber: string } | undefined;
  for (const type of plan.types) {
    // Twilio types the sub-resources separately, hence the explicit branch.
    [candidate] = type === 'mobile' ? await available.mobile.list(search) : await available.local.list(search);
    if (candidate) break;
  }
  if (!candidate) throw new Error(`Twilio has no ${plan.country} numbers available for purchase right now.`);

  const purchased = await client.incomingPhoneNumbers.create({
    phoneNumber: candidate.phoneNumber,
    friendlyName,
  });
  logger.info('twilio number purchased', { phoneNumber: purchased.phoneNumber, sid: purchased.sid });

  try {
    // Snake_case body — see senderProfile.ts for why.
    const body = buildSenderCreateBody({
      phoneNumber: purchased.phoneNumber,
      wabaId: targetWabaId,
      webhookUrl: env.TWILIO_WEBHOOK_URL ?? '',
      displayName,
      logoUrl: pictureUrl,
    });
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
 * Rewrites an owned number's Twilio friendly name — the ownership record every
 * environment on the shared Twilio account reads (see numberOwnership.ts).
 * Best-effort: does nothing when Twilio isn't configured or the number isn't
 * owned by this account (manually assigned external numbers), and swallows
 * failures — assignment and unassignment must not fail over a rename.
 */
async function renameOwnedNumber(phoneNumber: string, friendlyName: string): Promise<void> {
  if (!isTwilioConfigured()) return;
  try {
    const client = twilioClient();
    const [owned] = await client.incomingPhoneNumbers.list({ phoneNumber, limit: 1 });
    if (!owned) return;
    await client.incomingPhoneNumbers(owned.sid).update({ friendlyName });
    logger.info('twilio number renamed', { phoneNumber, friendlyName });
  } catch (err) {
    logger.error('failed to rename twilio number', err, { phoneNumber, friendlyName });
  }
}

/** After a number is unassigned from an agent: record it as free. */
export async function markNumberAsPooled(phoneNumber: string): Promise<void> {
  await renameOwnedNumber(phoneNumber, POOL_LABEL);
}

/** After a number is assigned to an agent instance: record that instance as its owner. */
export async function markNumberAsOwned(phoneNumber: string, label: string): Promise<void> {
  await renameOwnedNumber(phoneNumber, label);
}

async function updateSender(
  phoneNumber: string,
  plan: (current: { callbackUrl: string | null | undefined; logoUrl: string | null | undefined }) => ReturnType<typeof planSenderUpdate>,
): Promise<{ phoneNumber: string; callbackUrl: string | undefined; logoUrl: string | undefined } | null> {
  if (!isTwilioConfigured()) return null;
  const client = twilioClient();
  const senders = await client.messaging.v2.channelsSenders.list({ channel: 'whatsapp' });
  const sender = senders.find((s) => s.senderId === `whatsapp:${phoneNumber}`);
  if (!sender) return null;
  const update = plan({ callbackUrl: sender.webhook?.callbackUrl, logoUrl: sender.profile?.logoUrl });
  if (!update) return null;
  // Snake_case body — see senderProfile.ts for why.
  const handle = client.messaging.v2.channelsSenders(sender.sid);
  await handle.update(update.body as unknown as Parameters<typeof handle.update>[0]);
  return { phoneNumber, callbackUrl: update.body.webhook?.callback_url, logoUrl: update.body.profile?.logo_url };
}

/**
 * Claims an already-registered sender for this environment when an admin
 * assigns it to an agent (src/api/waAdmin.ts is the only caller): its inbound
 * webhook and its profile logo, in one Twilio call.
 *
 * Webhook: prod and dev share one Twilio account, so a pool number keeps the
 * callback URL of whichever environment last claimed it — assigning it must
 * take its inbound traffic, and a failure there propagates (the assignment
 * would silently swallow every client reply otherwise).
 *
 * Logo: the sender gets `pictureUrl` (the instance's effective picture) when
 * it has none or a different one; the display name is never touched. When
 * only the logo needs sending, a failure is logged and ignored — a missing
 * picture must not block the assignment.
 *
 * Anything that is not an assignment (picture uploads) goes through
 * pushSenderPicture, which never touches the webhook. No-op when Twilio isn't
 * configured or the number has no sender on this account.
 */
export async function claimSender(phoneNumber: string, pictureUrl: string | undefined): Promise<void> {
  const webhookUrl = env.TWILIO_WEBHOOK_URL;
  if (!webhookUrl) return;
  let webhookChanged = false;
  const plan = (current: { callbackUrl: string | null | undefined; logoUrl: string | null | undefined }) => {
    const update = planSenderUpdate(current, { webhookUrl, logoUrl: pictureUrl });
    webhookChanged = update?.webhookChanged ?? false;
    return update;
  };
  try {
    const applied = await updateSender(phoneNumber, plan);
    if (applied) logger.info(webhookChanged ? 'wa sender claimed' : 'wa sender logo applied', applied);
  } catch (err) {
    if (webhookChanged) throw err;
    logger.error('wa sender logo update failed', err, { phoneNumber, logoUrl: pictureUrl });
  }
}

/**
 * Sets an existing sender's profile logo to `pictureUrl` after an app logo or
 * agent icon upload/removal (src/api/logoAdmin.ts). The inbound webhook is
 * never part of this update, whatever it points at: a picture change in one
 * environment must not take a number away from another. No-op when the logo
 * already matches, there is no public picture, Twilio isn't configured or the
 * number has no sender here. Twilio errors propagate so the caller can report
 * them.
 */
export async function pushSenderPicture(phoneNumber: string, pictureUrl: string | undefined): Promise<void> {
  const applied = await updateSender(phoneNumber, (current) => planSenderUpdate(current, { webhookUrl: undefined, logoUrl: pictureUrl }));
  if (applied) logger.info('wa sender logo applied', applied);
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
