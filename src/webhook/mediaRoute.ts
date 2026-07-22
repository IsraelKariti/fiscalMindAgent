import { Router } from 'express';
import * as documentFiles from '../db/queries/documentFiles.js';
import { downloadBlob } from '../storage/blob.js';
import { verifyMediaToken } from '../storage/mediaUrl.js';
import { logger } from '../util/logger.js';

/**
 * Public, unauthenticated, capability-based file download: the token is an
 * expiring HMAC over one file id. Twilio fetches these when the agent sends a
 * document over WhatsApp. No session cookie, no id enumeration (the token is
 * unguessable and short-lived).
 */
export const mediaRoute = Router();

mediaRoute.get('/media/:token', async (req, res) => {
  const fileId = verifyMediaToken(req.params.token);
  if (!fileId) return res.status(404).send('not found');

  try {
    const file = await documentFiles.getById(fileId);
    if (!file) return res.status(404).send('not found');

    const blob = await downloadBlob(file.blob_key);
    res.setHeader('Content-Type', blob.contentType ?? file.content_type);
    if (blob.contentLength != null) res.setHeader('Content-Length', String(blob.contentLength));
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.filename)}"`);
    blob.stream.pipe(res);
  } catch (err) {
    logger.error('media route: download failed', err, { fileId });
    res.status(500).send('error');
  }
});
