import type { Response } from 'express';
import * as documentFiles from '../db/queries/documentFiles.js';
import type { DocumentFileRow } from '../db/types.js';
import { downloadBlob } from '../storage/blob.js';
import { childDownloadName } from '../agents/declarationOfCapital/splitChildNames.js';
import { fileDisposition } from './fileDisposition.js';

/**
 * Streams a received file's blob through the API so the container stays
 * private and access rides the dashboard session (no SAS URLs to leak). The
 * caller has already decided the requester may see `file`.
 */
export async function streamFile(res: Response, file: DocumentFileRow, asked: 'attachment' | 'inline'): Promise<void> {
  const disposition = fileDisposition(file.content_type, asked);
  const blob = await downloadBlob(file.blob_key);
  res.setHeader('Content-Type', file.content_type);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (blob.contentLength) res.setHeader('Content-Length', blob.contentLength);
  // A named child of a split PDF saves under its list document's name plus its source.
  let downloadName = file.filename;
  if (file.label && file.parent_file_id && file.page_from !== null && file.page_to !== null) {
    const parent = await documentFiles.getForClient(file.parent_file_id, file.client_id);
    downloadName = childDownloadName(file.label, parent?.filename ?? '', file.page_from, file.page_to);
  }
  // RFC 5987 encoding: filenames are sanitized ASCII at ingest, but stay defensive.
  res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(downloadName)}`);
  blob.stream.pipe(res);
}
