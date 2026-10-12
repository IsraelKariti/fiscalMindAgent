import express, { type RequestHandler } from 'express';
import { z } from 'zod';
import * as agentInstances from '../db/queries/agentInstances.js';
import * as appSettings from '../db/queries/appSettings.js';
import * as waSenders from '../db/queries/waSenders.js';
import { env } from '../config/env.js';
import { deleteBlob, uploadBlob } from '../storage/blob.js';
import { effectivePictureFor, getAppLogoKey, senderPictureFor } from '../storage/agentPicture.js';
import {
  APP_LOGO_SETTING_KEY,
  LOGO_MAX_BYTES,
  defaultLogoUrl,
  logoUrl,
  newLogoBlobKey,
  sniffImageType,
} from '../storage/logos.js';
import { pushSenderPicture } from '../twilio/provision.js';
import { logger } from '../util/logger.js';

/**
 * Admin-owned pictures (src/storage/logos.ts): the app logo (settings page)
 * and the per-agent icon (agent page). Uploads arrive as a raw image body —
 * one file, no multipart — and are checked by magic bytes, never by the
 * Content-Type header. Every upload is a new blob under a new key; the old
 * blob is removed best-effort. A change is pushed to the affected Twilio
 * senders in the same request, and a Twilio failure never undoes the save.
 */

/** Route-level body parser for the two PUT routes: image bodies only, 2 MB cap (413 above it). */
export const logoBodyParser = express.raw({ type: ['image/png', 'image/jpeg'], limit: LOGO_MAX_BYTES });

const REJECT_MESSAGE = 'Expected a PNG or JPEG image of up to 2 MB.';

/** The uploaded bytes when they are a PNG/JPEG within the cap, else a 400 (already sent). */
function acceptUpload(req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1]): { bytes: Buffer; ext: 'png' | 'jpg'; contentType: string } | null {
  const bytes = Buffer.isBuffer(req.body) ? req.body : null;
  const type = bytes && bytes.length > 0 ? sniffImageType(bytes) : null;
  if (!bytes || !type) {
    res.status(400).json({ error: REJECT_MESSAGE });
    return null;
  }
  return { bytes, ext: type.ext, contentType: type.contentType };
}

async function storeUpload(upload: { bytes: Buffer; ext: 'png' | 'jpg'; contentType: string }): Promise<string> {
  const key = newLogoBlobKey(upload.ext);
  await uploadBlob(key, upload.bytes, upload.contentType);
  return key;
}

async function dropBlob(key: string | null): Promise<void> {
  if (!key) return;
  try {
    await deleteBlob(key);
  } catch (err) {
    logger.error('logo blob delete failed (orphan left under logos/)', err, { key });
  }
}

/** Pushes `pictureUrl` to one sender; false on a Twilio failure (logged), never throws. */
async function pushPicture(phoneNumber: string, pictureUrl: string | undefined, instanceId: string): Promise<boolean> {
  try {
    await pushSenderPicture(phoneNumber, pictureUrl);
    return true;
  } catch (err) {
    logger.error('wa sender picture push failed', err, { phoneNumber, instanceId });
    return false;
  }
}

/**
 * After the app logo changed: every sender whose instance has no own icon
 * gets the new effective picture. Sequential, each failure isolated.
 */
async function pushAppLogoToSenders(appLogoKey: string | null): Promise<{ sendersUpdated: number; sendersFailed: number }> {
  let sendersUpdated = 0;
  let sendersFailed = 0;
  for (const instance of await agentInstances.listWithSenders()) {
    if (instance.logo_blob_key) continue;
    const ok = await pushPicture(instance.phone_number, await senderPictureFor(instance, appLogoKey), instance.id);
    if (ok) sendersUpdated += 1;
    else sendersFailed += 1;
  }
  return { sendersUpdated, sendersFailed };
}

function appLogoView(appLogoKey: string | null) {
  return {
    logoUrl: appLogoKey ? logoUrl(appLogoKey, env.APP_BASE_URL) : null,
    defaultLogoUrl: defaultLogoUrl(env.APP_BASE_URL),
  };
}

/** GET /api/admin/app-logo — the uploaded app logo (null = built-in default) and the default's URL. */
export const adminGetAppLogo: RequestHandler = async (_req, res) => {
  res.json(appLogoView(await getAppLogoKey()));
};

/** PUT /api/admin/app-logo — raw PNG/JPEG body; replaces the app logo and re-aligns every sender without an own icon. */
export const adminUploadAppLogo: RequestHandler = async (req, res) => {
  const upload = acceptUpload(req, res);
  if (!upload) return;
  const previous = await getAppLogoKey();
  const key = await storeUpload(upload);
  await appSettings.upsert(APP_LOGO_SETTING_KEY, key);
  await dropBlob(previous);
  const pushed = await pushAppLogoToSenders(key);
  logger.info('app logo uploaded', { adminUserId: req.realUserId, key, previous, ...pushed });
  res.json({ ...appLogoView(key), ...pushed });
};

/** DELETE /api/admin/app-logo — back to the built-in default; idempotent. */
export const adminDeleteAppLogo: RequestHandler = async (req, res) => {
  const previous = await getAppLogoKey();
  if (previous) {
    await appSettings.remove(APP_LOGO_SETTING_KEY);
    await dropBlob(previous);
  }
  const pushed = previous ? await pushAppLogoToSenders(null) : { sendersUpdated: 0, sendersFailed: 0 };
  logger.info('app logo removed', { adminUserId: req.realUserId, previous, ...pushed });
  res.json({ ...appLogoView(null), ...pushed });
};

async function instanceFromParams(req: Parameters<RequestHandler>[0]) {
  const id = z.string().uuid().safeParse(req.params.agentInstanceId);
  return id.success ? agentInstances.getById(id.data) : null;
}

/** The agent-icon response: own icon URL, effective picture, and whether the sender took it (null = no number). */
async function agentLogoView(instance: { id: string; logo_blob_key: string | null }, waProfileUpdated: boolean | null) {
  return {
    logoUrl: instance.logo_blob_key ? logoUrl(instance.logo_blob_key, env.APP_BASE_URL) : null,
    effectivePicture: await effectivePictureFor(instance),
    waProfileUpdated,
  };
}

/** The instance's sender takes its (new) effective picture; null when it has no number. */
async function pushInstancePicture(instance: { id: string; logo_blob_key: string | null }): Promise<boolean | null> {
  const sender = await waSenders.getByInstanceId(instance.id);
  if (!sender) return null;
  return pushPicture(sender.phone_number, await senderPictureFor(instance), instance.id);
}

/** PUT /api/admin/agents/:agentInstanceId/logo — raw PNG/JPEG body; replaces the agent's own icon. */
export const adminUploadAgentLogo: RequestHandler = async (req, res) => {
  const instance = await instanceFromParams(req);
  if (!instance) {
    res.status(404).json({ error: 'Agent instance not found.' });
    return;
  }
  const upload = acceptUpload(req, res);
  if (!upload) return;
  const key = await storeUpload(upload);
  const updated = (await agentInstances.setLogoBlobKey(instance.id, key)) ?? { ...instance, logo_blob_key: key };
  await dropBlob(instance.logo_blob_key);
  const waProfileUpdated = await pushInstancePicture(updated);
  logger.info('agent icon uploaded', { adminUserId: req.realUserId, instanceId: instance.id, key, waProfileUpdated });
  res.json(await agentLogoView(updated, waProfileUpdated));
};

/** DELETE /api/admin/agents/:agentInstanceId/logo — back to the app logo / default; idempotent. */
export const adminDeleteAgentLogo: RequestHandler = async (req, res) => {
  const instance = await instanceFromParams(req);
  if (!instance) {
    res.status(404).json({ error: 'Agent instance not found.' });
    return;
  }
  let waProfileUpdated: boolean | null = null;
  if (instance.logo_blob_key) {
    await agentInstances.setLogoBlobKey(instance.id, null);
    await dropBlob(instance.logo_blob_key);
    waProfileUpdated = await pushInstancePicture({ id: instance.id, logo_blob_key: null });
    logger.info('agent icon removed', { adminUserId: req.realUserId, instanceId: instance.id, waProfileUpdated });
  }
  res.json(await agentLogoView({ id: instance.id, logo_blob_key: null }, waProfileUpdated));
};
