import * as documentFiles from '../db/queries/documentFiles.js';
import type { DocumentFileRow } from '../db/types.js';
import { uploadBlob } from '../storage/blob.js';
import { recordAudit } from '../audit/audit.js';
import { analyzeStoredFile } from './analyzeStoredFile.js';
import { INGEST_ATTEMPTS } from './ingestRetry.js';
import {
  ingestInboundFileWith,
  type InboundFileContext,
  type InboundFileDeps,
  type InboundFileItem,
} from './ingestInboundFileCore.js';

export type { InboundFileContext, InboundFileItem } from './ingestInboundFileCore.js';

const deps: InboundFileDeps = {
  uploadBlob,
  insertIfNew: documentFiles.insertIfNew,
  analyze: analyzeStoredFile,
  recordAudit,
  retry: INGEST_ATTEMPTS,
};

/** The production wiring of `ingestInboundFileWith` (see ingestInboundFileCore.ts). */
export function ingestInboundFile(ctx: InboundFileContext, item: InboundFileItem): Promise<DocumentFileRow | null> {
  return ingestInboundFileWith(ctx, item, deps);
}
