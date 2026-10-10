import type { Response } from 'express';
import * as documentFiles from '../db/queries/documentFiles.js';
import type { DocumentFileRow } from '../db/types.js';
import { downloadBlob } from '../storage/blob.js';
import { childDownloadName } from '../agents/declarationOfCapital/splitChildNames.js';
import { fileDisposition } from './fileDisposition.js';
import { isSpreadsheetType, renderSpreadsheetText } from '../agents/shared/spreadsheetText.js';

/**
 * Streams a received file's blob through the API so the container stays
 * private and access rides the dashboard session (no SAS URLs to leak). The
 * caller has already decided the requester may see `file`.
 */
export async function streamFile(res: Response, file: DocumentFileRow, asked: 'attachment' | 'inline'): Promise<void> {
  if (asked === 'inline' && isSpreadsheetType(file.content_type)) {
    await sendSpreadsheetText(res, file);
    return;
  }
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

/**
 * The inline view of a spreadsheet is the plain-text rendering the model
 * read (openspec `spreadsheet-files`), never the workbook bytes: text/plain
 * cannot execute on the API origin, and it is what the admin wants to see.
 * The download of the same file still returns the original.
 */
async function sendSpreadsheetText(res: Response, file: DocumentFileRow): Promise<void> {
  const blob = await downloadBlob(file.blob_key);
  const chunks: Buffer[] = [];
  for await (const chunk of blob.stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  let text: string;
  try {
    text = await renderSpreadsheetText(Buffer.concat(chunks), file.content_type);
  } catch {
    text = 'לא ניתן לקרוא את הקובץ.';
  }
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', 'inline');
  res.send(text);
}
