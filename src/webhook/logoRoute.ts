import { Router } from 'express';
import * as agentInstances from '../db/queries/agentInstances.js';
import * as appSettings from '../db/queries/appSettings.js';
import { downloadBlob } from '../storage/blob.js';
import { APP_LOGO_SETTING_KEY, logoBlobKeyFromPath } from '../storage/logos.js';
import { logger } from '../util/logger.js';

/**
 * Public, unauthenticated pictures: the admin-uploaded app logo and the
 * per-agent icons (src/storage/logos.ts). Meta fetches a sender's profile
 * picture itself, at any later time, so unlike /media/:token these URLs do
 * not expire; they are unguessable (128 random bits) and only the *current*
 * key of a picture resolves — a replaced picture goes 404 at once. The
 * built-in default (/petal-seal.png) is a plain static file.
 */
export const logoRoute = Router();

logoRoute.get('/logos/:key', async (req, res) => {
  const blobKey = logoBlobKeyFromPath(req.params.key);
  if (!blobKey) return res.status(404).send('not found');

  try {
    const appLogo = await appSettings.get(APP_LOGO_SETTING_KEY);
    const current = appLogo?.value === blobKey || (await agentInstances.getByLogoKey(blobKey)) !== null;
    if (!current) return res.status(404).send('not found');

    const blob = await downloadBlob(blobKey);
    res.setHeader('Content-Type', blob.contentType ?? (blobKey.endsWith('.png') ? 'image/png' : 'image/jpeg'));
    if (blob.contentLength != null) res.setHeader('Content-Length', String(blob.contentLength));
    // Every replacement is a new URL, so the bytes behind one never change.
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    blob.stream.pipe(res);
  } catch (err) {
    logger.error('logo route: download failed', err, { blobKey });
    res.status(500).send('error');
  }
});
