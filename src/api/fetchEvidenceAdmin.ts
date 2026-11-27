import type { RequestHandler } from 'express';
import { z } from 'zod';
import * as documentFetchSessions from '../db/queries/documentFetchSessions.js';
import {
  evidenceKey,
  groupEvidenceKeys,
  listSessionEvidence,
  resolveEvidencePrefix,
  type EvidenceFile,
} from '../agents/declarationOfCapital/documentFetch/stepEvidence.js';
import { downloadBlob } from '../storage/blob.js';

/**
 * The admin evidence gallery of one website-fetch session (openspec
 * `fetch-step-evidence`): the steps the runner recorded with their
 * screenshots, HTML copies, snapshots and records, streamed under the admin
 * session. Keyed by the session id alone, so the trace step modal and the
 * site-access screen reach the same data.
 */

const PART_SCHEMA = z.enum(['screenshot', 'html', 'mhtml', 'record']);

/**
 * GET /api/admin/document-fetch/:sessionId/evidence — the session's summary and
 * its stored steps in order. An unknown session is "not found"; a known
 * session without evidence answers an empty step list (the UI says "no
 * evidence kept").
 */
export const adminGetFetchEvidence: RequestHandler = async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.sessionId);
  const session = id.success ? await documentFetchSessions.getById(id.data) : null;
  if (!session) {
    res.status(404).json({ error: 'Session not found.' });
    return;
  }
  const steps = await listSessionEvidence(session.id, session.created_at);
  res.json({
    session: {
      id: session.id,
      clientId: session.client_id,
      provider: session.provider,
      status: session.status,
      error: session.error,
      taxYear: session.tax_year,
      createdAt: session.created_at.toISOString(),
      updatedAt: session.updated_at.toISOString(),
    },
    steps: steps.map((s) => ({
      seq: s.seq,
      name: s.name,
      parts: s.parts,
      at: s.record?.at ?? null,
      url: s.record?.url ?? null,
      title: s.record?.title ?? null,
      error: s.record?.error ?? null,
      missing: s.record?.missing ?? {},
      record: s.record,
    })),
  });
};

/**
 * Response headers per part. The HTML copy came from an external site and
 * must never run on this origin: its inline view is sandboxed by CSP (opaque
 * origin, no scripts) and only inline styles / data images may load. The
 * snapshot is download-only (a browser opens an .mhtml file from disk).
 */
function headersFor(part: EvidenceFile, as: 'view' | 'download', filename: string): Record<string, string> {
  const base = { 'X-Content-Type-Options': 'nosniff' };
  const attachment = { ...base, 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}` };
  switch (part) {
    case 'screenshot':
      return as === 'view' ? { ...base, 'Content-Type': 'image/png', 'Content-Disposition': 'inline' } : { ...attachment, 'Content-Type': 'image/png' };
    case 'html':
      return as === 'view'
        ? {
            ...base,
            'Content-Type': 'text/html; charset=utf-8',
            'Content-Disposition': 'inline',
            'Content-Security-Policy': "sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:",
          }
        : { ...attachment, 'Content-Type': 'text/html; charset=utf-8' };
    case 'mhtml':
      return { ...attachment, 'Content-Type': 'application/octet-stream' };
    case 'record':
      return as === 'view'
        ? { ...base, 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'inline' }
        : { ...attachment, 'Content-Type': 'application/json; charset=utf-8' };
  }
}

const EXT: Record<EvidenceFile, string> = { screenshot: 'png', html: 'html', mhtml: 'mhtml', record: 'json' };

/**
 * GET /api/admin/document-fetch/:sessionId/evidence/:seq/:part?as=view|download —
 * one evidence file. The blob key is built server-side from the session's
 * own listing; the request names only a step number and a part from the
 * allowlist, so no path from the browser ever reaches storage.
 */
export const adminServeFetchEvidence: RequestHandler = async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.sessionId);
  const seq = z.coerce.number().int().min(1).max(999).safeParse(req.params.seq);
  const part = PART_SCHEMA.safeParse(req.params.part);
  const as = req.query['as'] === 'download' ? 'download' : 'view';
  const session = id.success && seq.success && part.success ? await documentFetchSessions.getById(id.data) : null;
  if (!session || !seq.success || !part.success) {
    res.status(404).json({ error: 'Evidence not found.' });
    return;
  }
  const { prefix, keys } = await resolveEvidencePrefix(session.id, session.created_at);
  const step = groupEvidenceKeys(prefix, keys).find((s) => s.seq === seq.data);
  if (!step || !step.parts.includes(part.data)) {
    res.status(404).json({ error: 'Evidence not found.' });
    return;
  }
  const blob = await downloadBlob(evidenceKey(prefix, step.seq, step.name, part.data));
  const filename = `${session.provider}-${session.id.slice(0, 8)}-${String(step.seq).padStart(2, '0')}-${step.name}.${EXT[part.data]}`;
  for (const [name, value] of Object.entries(headersFor(part.data, as, filename))) res.setHeader(name, value);
  if (blob.contentLength) res.setHeader('Content-Length', blob.contentLength);
  blob.stream.pipe(res);
};

/** Pure: the headers of one part, exported for the route test. */
export const evidenceHeadersFor = headersFor;
