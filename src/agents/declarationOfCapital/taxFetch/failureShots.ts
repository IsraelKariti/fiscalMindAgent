import { deleteBlob, listBlobs, uploadBlob } from '../../../storage/blob.js';
import { env } from '../../../config/env.js';
import { logger } from '../../../util/logger.js';
import { RunnerStepError } from './types.js';

/**
 * Failure screenshots the runner sent back with a failed step, stored so the
 * evidence outlives the throwaway ACI container. They live under their own
 * prefix in the documents container and are auto-deleted after
 * TAX_FETCH_DEBUG_RETENTION_DAYS by the daily cleanup job — never referenced
 * from the DB, so deletion needs no bookkeeping.
 */
export const FAILURE_SHOT_PREFIX = 'debug/taxfetch/';

/**
 * Stores the failure screenshot carried by a runner error, if any. Returns the
 * blob key (also logged) or null. Best-effort — the fetch outcome is already
 * being recorded; evidence storage must never mask it.
 */
export async function persistFailureShot(sessionId: string, stage: string, err: unknown): Promise<string | null> {
  if (!(err instanceof RunnerStepError) || !err.screenshotPng || err.screenshotPng.length === 0) return null;
  // Day directory first, so a listing reads chronologically and an operator can
  // prune by eye; the session id + stage make the key self-describing.
  const key = `${FAILURE_SHOT_PREFIX}${new Date().toISOString().slice(0, 10)}/${sessionId}-${stage}.png`;
  try {
    await uploadBlob(key, err.screenshotPng, 'image/png');
    logger.info('tax fetch: failure screenshot stored', {
      sessionId,
      stage,
      blobKey: key,
      bytes: err.screenshotPng.length,
    });
    return key;
  } catch (uploadErr) {
    logger.warn('tax fetch: failure screenshot upload failed', { sessionId, stage, reason: String(uploadErr) });
    return null;
  }
}

/** Deletes failure screenshots older than the retention window. Returns how many were removed. */
export async function cleanupExpiredFailureShots(now = new Date()): Promise<number> {
  const cutoff = now.getTime() - env.TAX_FETCH_DEBUG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const blobs = await listBlobs(FAILURE_SHOT_PREFIX);
  // A blob the service reports without a creation time still expires: fall back
  // to the day encoded in its key, so nothing can linger forever.
  const createdAt = (blob: { key: string; createdOn: Date | null }): number => {
    if (blob.createdOn) return blob.createdOn.getTime();
    const day = /^debug\/taxfetch\/(\d{4}-\d{2}-\d{2})\//.exec(blob.key)?.[1];
    return day ? new Date(`${day}T00:00:00Z`).getTime() : 0;
  };
  const expired = blobs.filter((b) => createdAt(b) < cutoff);
  for (const blob of expired) {
    await deleteBlob(blob.key);
  }
  if (expired.length > 0) {
    logger.info('tax fetch: expired failure screenshots deleted', {
      deleted: expired.length,
      kept: blobs.length - expired.length,
      retentionDays: env.TAX_FETCH_DEBUG_RETENTION_DAYS,
    });
  }
  return expired.length;
}
