import * as appSettings from '../db/queries/appSettings.js';
import type { AgentInstanceRow } from '../db/types.js';
import { env } from '../config/env.js';
import { logger } from '../util/logger.js';
import { APP_LOGO_SETTING_KEY, effectivePictureUrl, senderPictureUrl, type EffectivePicture } from './logos.js';

/**
 * DB/env-aware wrappers over src/storage/logos.ts: the picture one agent
 * instance shows, resolved against the admin-uploaded app logo.
 */

/** Blob key of the admin-uploaded app logo, null when none is uploaded. */
export async function getAppLogoKey(): Promise<string | null> {
  return (await appSettings.get(APP_LOGO_SETTING_KEY))?.value ?? null;
}

type PictureInstance = Pick<AgentInstanceRow, 'id' | 'logo_blob_key'>;

/** The instance's effective picture (URL + level); pass `appLogoKey` when looping to avoid a query per instance. */
export async function effectivePictureFor(instance: PictureInstance, appLogoKey?: string | null): Promise<EffectivePicture> {
  const appKey = appLogoKey === undefined ? await getAppLogoKey() : appLogoKey;
  return effectivePictureUrl({ instanceKey: instance.logo_blob_key, appLogoKey: appKey, appBaseUrl: env.APP_BASE_URL });
}

/**
 * The URL to hand Twilio for this instance's sender, or undefined (with a log
 * line) when the app base is not public https — local dev.
 */
export async function senderPictureFor(instance: PictureInstance, appLogoKey?: string | null): Promise<string | undefined> {
  const appKey = appLogoKey === undefined ? await getAppLogoKey() : appLogoKey;
  const input = { instanceKey: instance.logo_blob_key, appLogoKey: appKey, appBaseUrl: env.APP_BASE_URL };
  const url = senderPictureUrl(input);
  if (!url) {
    logger.info('wa sender picture skipped: not a public https URL', {
      instanceId: instance.id,
      picture: effectivePictureUrl(input),
    });
  }
  return url;
}
