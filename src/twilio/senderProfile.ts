/**
 * Pure helpers behind the WhatsApp sender profile (display name + logo) and
 * the per-assignment alignment of an existing sender. Kept free of env/Twilio
 * imports so they are unit-testable; src/twilio/provision.ts wires them up.
 *
 * Twilio's Senders v2 SDK forwards request objects verbatim as the JSON body,
 * so every key here is the API's snake_case one (its camelCase typings don't
 * match what the endpoint accepts). Responses, by contrast, come back
 * camelCase (`profile.logoUrl`, `webhook.callbackUrl`).
 *
 * Which picture URL to send is decided by src/storage/logos.ts
 * (senderPictureUrl: agent icon, app logo, built-in default; https only).
 */

export interface SenderProfileBody {
  name?: string;
  logo_url?: string;
}

export interface SenderWebhookBody {
  callback_url: string;
  callback_method: 'POST';
}

export interface SenderCreateBody {
  sender_id: string;
  configuration: { waba_id: string };
  webhook: SenderWebhookBody;
  profile: SenderProfileBody;
}

/** Body of the Senders v2 create call for a freshly purchased number. */
export function buildSenderCreateBody(input: {
  phoneNumber: string;
  wabaId: string;
  webhookUrl: string;
  displayName: string;
  logoUrl: string | undefined;
}): SenderCreateBody {
  const profile: SenderProfileBody = { name: input.displayName };
  if (input.logoUrl) profile.logo_url = input.logoUrl;
  return {
    sender_id: `whatsapp:${input.phoneNumber}`,
    configuration: { waba_id: input.wabaId },
    webhook: { callback_url: input.webhookUrl, callback_method: 'POST' },
    profile,
  };
}

export interface SenderUpdateBody {
  webhook?: SenderWebhookBody;
  profile?: SenderProfileBody;
}

export interface SenderUpdatePlan {
  body: SenderUpdateBody;
  /** True when the inbound webhook is part of the update — that part must not fail silently. */
  webhookChanged: boolean;
}

/**
 * What an update has to change on an existing sender: the inbound webhook
 * when one is wanted and the current one points elsewhere, the profile logo
 * when it is missing or different. `wanted.webhookUrl` undefined = a
 * picture-only update that leaves the webhook alone whatever it points at
 * (prod and dev share one Twilio account; only an assignment may claim a
 * number). The display name is never touched (Meta reviews name changes, and
 * an externally registered sender keeps its own). Null = nothing to do.
 */
export function planSenderUpdate(
  current: { callbackUrl: string | null | undefined; logoUrl: string | null | undefined },
  wanted: { webhookUrl: string | undefined; logoUrl: string | undefined },
): SenderUpdatePlan | null {
  const body: SenderUpdateBody = {};
  if (wanted.webhookUrl !== undefined && current.callbackUrl !== wanted.webhookUrl) {
    body.webhook = { callback_url: wanted.webhookUrl, callback_method: 'POST' };
  }
  const webhookChanged = body.webhook !== undefined;
  if (wanted.logoUrl && current.logoUrl !== wanted.logoUrl) body.profile = { logo_url: wanted.logoUrl };
  if (!body.webhook && !body.profile) return null;
  return { body, webhookChanged };
}

/**
 * The display name the buy step prefills (openspec `whatsapp-sender`): the
 * accountant's admin-entered Hebrew name, else their account name, followed
 * by "by <brand>" when the sender registers under the platform WABA — Meta's
 * accepted form for a name whose link to the account owner is not public.
 * Under the accountant's own WABA the name stands alone. No accountant name
 * at all = the brand alone (the old fixed behaviour).
 */
export function defaultSenderDisplayName(input: {
  hebrewName: string | null | undefined;
  name: string | null | undefined;
  brand: string;
  ownWaba: boolean;
}): string {
  const accountant = input.hebrewName?.trim() || input.name?.trim() || '';
  if (!accountant) return input.brand;
  return input.ownWaba ? accountant : `${accountant} by ${input.brand}`;
}
