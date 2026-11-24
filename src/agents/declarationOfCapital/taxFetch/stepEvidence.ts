import { deleteBlob, downloadBlob, listBlobs, uploadBlob } from '../../../storage/blob.js';
import { env } from '../../../config/env.js';
import * as taxFetchSessions from '../../../db/queries/taxFetchSessions.js';
import { logger } from '../../../util/logger.js';
import type { EvidencePart, StepRecord } from '../../../browserRunner/stepEvidence.js';
import { RunnerStepError } from './types.js';

/**
 * Where a fetch session's step evidence lives once the worker pulled it out
 * of the runner (openspec `fetch-step-evidence`): one blob per part under
 * `debug/taxfetch/<day of session creation>/<sessionId>/<seq>-<name>.<ext>`
 * in the documents container. No table points at it — the session id and
 * its creation day are the whole index (listBlobs on the prefix) — and the
 * daily cleanup job deletes everything older than
 * TAX_FETCH_DEBUG_RETENTION_DAYS. Old flat failure shots
 * (`debug/taxfetch/<day>/<sessionId>-<stage>.png`) share the prefix and age
 * out the same way.
 */
export const EVIDENCE_PREFIX = 'debug/taxfetch/';

export type EvidenceFile = EvidencePart | 'record';

const EXT: Record<EvidenceFile, string> = { screenshot: 'png', html: 'html', mhtml: 'mhtml', record: 'json' };
const CONTENT_TYPE: Record<EvidenceFile, string> = {
  screenshot: 'image/png',
  html: 'text/html; charset=utf-8',
  mhtml: 'multipart/related',
  record: 'application/json',
};

/** One item as the worker stores it: the record plus whichever parts the runner had. */
export interface StoredEvidenceItem {
  record: StepRecord;
  screenshot?: Buffer | null;
  html?: Buffer | null;
  mhtml?: Buffer | null;
}

const day = (at: Date): string => at.toISOString().slice(0, 10);

/** The blob prefix of one session's evidence. */
export function evidencePrefixFor(sessionId: string, createdAt: Date): string {
  return `${EVIDENCE_PREFIX}${day(createdAt)}/${sessionId}/`;
}

/** Step names come from provider code, but stay defensive: a blob key segment never carries a path or odd bytes. */
const safeName = (name: string): string => name.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'step';

/** The blob key of one part of one step. */
export function evidenceKey(prefix: string, seq: number, name: string, part: EvidenceFile): string {
  return `${prefix}${String(seq).padStart(2, '0')}-${safeName(name)}.${EXT[part]}`;
}

/** Parses an evidence blob key back into its step and part; null for a key of another layout (old flat shots). */
export function parseEvidenceKey(prefix: string, key: string): { seq: number; name: string; part: EvidenceFile } | null {
  if (!key.startsWith(prefix)) return null;
  const m = /^(\d+)-(.+)\.(png|html|mhtml|json)$/.exec(key.slice(prefix.length));
  if (!m) return null;
  const part = (Object.keys(EXT) as EvidenceFile[]).find((p) => EXT[p] === m[3]);
  if (!part) return null;
  return { seq: Number.parseInt(m[1] as string, 10), name: m[2] as string, part };
}

/** Uploads every part the item carries, the record last (its presence means the step is complete). */
export async function storeEvidenceItem(prefix: string, item: StoredEvidenceItem): Promise<void> {
  const { record } = item;
  for (const part of ['screenshot', 'html', 'mhtml'] as const) {
    const bytes = item[part];
    if (!bytes || bytes.length === 0) continue;
    await uploadBlob(evidenceKey(prefix, record.seq, record.name, part), bytes, CONTENT_TYPE[part]);
  }
  await uploadBlob(evidenceKey(prefix, record.seq, record.name, 'record'), Buffer.from(JSON.stringify(record), 'utf8'), CONTENT_TYPE.record);
}

// Session → prefix, so the per-step pulls do not re-read the row each time.
const prefixCache = new Map<string, string>();

/** The evidence prefix of a session by id (its creation day comes from the row); null for an unknown session. */
export async function sessionEvidencePrefix(sessionId: string): Promise<string | null> {
  const cached = prefixCache.get(sessionId);
  if (cached) return cached;
  const row = await taxFetchSessions.getById(sessionId);
  if (!row) return null;
  const prefix = evidencePrefixFor(sessionId, row.created_at);
  prefixCache.set(sessionId, prefix);
  return prefix;
}

/** Stores one item under the session's prefix. Never throws — evidence must never change a fetch's outcome. */
export async function storeSessionEvidence(sessionId: string, item: StoredEvidenceItem): Promise<boolean> {
  try {
    const prefix = await sessionEvidencePrefix(sessionId);
    if (!prefix) {
      logger.warn('tax fetch: evidence for an unknown session dropped', { sessionId, seq: item.record.seq });
      return false;
    }
    await storeEvidenceItem(prefix, item);
    return true;
  } catch (err) {
    logger.warn('tax fetch: storing step evidence failed', { sessionId, seq: item.record.seq, reason: String(err) });
    return false;
  }
}

/**
 * Fallback for a runner whose evidence pull yielded nothing: the 502 body's
 * failure screenshot (RunnerStepError.screenshotPng) becomes one item named
 * `<stage>-failed-fallback`, so the gallery still shows the failing moment.
 * Null when the error carries no screenshot. Pure.
 */
export function fallbackShotItem(stage: string, err: unknown, now = new Date()): StoredEvidenceItem | null {
  if (!(err instanceof RunnerStepError) || !err.screenshotPng || err.screenshotPng.length === 0) return null;
  const record: StepRecord = {
    seq: 99,
    name: `${stage}-failed-fallback`,
    at: now.toISOString(),
    url: null,
    title: null,
    frames: [],
    console: [],
    responses: [],
    error: err.message,
    missing: { html: 'fallback screenshot from the error reply only', mhtml: 'fallback screenshot from the error reply only' },
    sizes: { screenshot: err.screenshotPng.length },
  };
  return { record, screenshot: err.screenshotPng };
}

/** One step of a session's stored evidence, as the admin gallery lists it. */
export interface StoredEvidenceStep {
  seq: number;
  name: string;
  parts: EvidenceFile[];
  /** The record, when its blob exists and parses; null for a step whose record was lost. */
  record: StepRecord | null;
}

/** Groups a prefix listing into steps (pure; the blob reads are the caller's). */
export function groupEvidenceKeys(prefix: string, keys: string[]): Array<{ seq: number; name: string; parts: EvidenceFile[] }> {
  const steps = new Map<number, { seq: number; name: string; parts: EvidenceFile[] }>();
  for (const key of keys) {
    const parsed = parseEvidenceKey(prefix, key);
    if (!parsed) continue;
    const step = steps.get(parsed.seq) ?? { seq: parsed.seq, name: parsed.name, parts: [] };
    if (!step.parts.includes(parsed.part)) step.parts.push(parsed.part);
    steps.set(parsed.seq, step);
  }
  return [...steps.values()].sort((a, b) => a.seq - b.seq);
}

async function readBlobText(key: string): Promise<string> {
  const blob = await downloadBlob(key);
  const chunks: Buffer[] = [];
  for await (const chunk of blob.stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

/** Everything stored for a session, steps in order with their parsed records. Empty for a session without evidence. */
export async function listSessionEvidence(sessionId: string, createdAt: Date): Promise<StoredEvidenceStep[]> {
  const prefix = evidencePrefixFor(sessionId, createdAt);
  const keys = (await listBlobs(prefix)).map((b) => b.key);
  const steps = groupEvidenceKeys(prefix, keys);
  return Promise.all(
    steps.map(async (step) => {
      let record: StepRecord | null = null;
      if (step.parts.includes('record')) {
        try {
          record = JSON.parse(await readBlobText(evidenceKey(prefix, step.seq, step.name, 'record'))) as StepRecord;
        } catch (err) {
          logger.warn('tax fetch: evidence record unreadable', { sessionId, seq: step.seq, reason: String(err) });
        }
      }
      return { ...step, record };
    }),
  );
}

/** The day encoded in an evidence key (either layout), for a blob the service reports without a creation time. */
export function evidenceDayOf(key: string): string | null {
  return /^debug\/taxfetch\/(\d{4}-\d{2}-\d{2})\//.exec(key)?.[1] ?? null;
}

/** Deletes evidence (and old flat failure shots) older than the retention window. Returns how many blobs were removed. */
export async function cleanupExpiredEvidence(now = new Date()): Promise<number> {
  const cutoff = now.getTime() - env.TAX_FETCH_DEBUG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const blobs = await listBlobs(EVIDENCE_PREFIX);
  // A blob the service reports without a creation time still expires: fall back
  // to the day encoded in its key, so nothing can linger forever.
  const createdAt = (blob: { key: string; createdOn: Date | null }): number => {
    if (blob.createdOn) return blob.createdOn.getTime();
    const dayOf = evidenceDayOf(blob.key);
    return dayOf ? new Date(`${dayOf}T00:00:00Z`).getTime() : 0;
  };
  const expired = blobs.filter((b) => createdAt(b) < cutoff);
  for (const blob of expired) {
    await deleteBlob(blob.key);
  }
  if (expired.length > 0) {
    logger.info('tax fetch: expired step evidence deleted', {
      deleted: expired.length,
      kept: blobs.length - expired.length,
      retentionDays: env.TAX_FETCH_DEBUG_RETENTION_DAYS,
    });
  }
  return expired.length;
}
