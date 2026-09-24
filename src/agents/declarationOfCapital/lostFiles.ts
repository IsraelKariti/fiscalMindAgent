/**
 * Files the client sent that the platform could not store (openspec
 * `inbound-files`): the `file.ingest_failed` steps of the client, minus the
 * ones a later delivery or a manual re-ingest stored after all, grouped by
 * the inbound message they belong to for the thread transcript.
 */

export interface LostFile {
  providerAttachmentId: string;
  /** 0-based position in the message. */
  index: number;
  contentType: string;
  fileNameHint: string | null;
  attempts: number;
}

/** Keyed by the inbound message row id (emails.id). */
export type LostFilesByMessage = Map<string, LostFile[]>;

/** The slice of an audit row this needs (see auditEvents.listForClientAction). */
export interface LostFileStep {
  target_id: string | null;
  detail: Record<string, unknown>;
}

export function lostFilesByMessage(
  steps: LostFileStep[],
  storedProviderAttachmentIds: Iterable<string>,
): LostFilesByMessage {
  const stored = new Set(storedProviderAttachmentIds);
  // One line per file even when a provider redelivery produced two failure
  // rows for it; the later row (steps are oldest first) wins.
  const byAttachment = new Map<string, { messageId: string; file: LostFile }>();
  for (const step of steps) {
    const d = step.detail;
    const providerAttachmentId = typeof d.providerAttachmentId === 'string' ? d.providerAttachmentId : null;
    if (!step.target_id || !providerAttachmentId || stored.has(providerAttachmentId)) continue;
    byAttachment.set(providerAttachmentId, {
      messageId: step.target_id,
      file: {
        providerAttachmentId,
        index: typeof d.index === 'number' ? d.index : 0,
        contentType: typeof d.contentType === 'string' ? d.contentType : 'application/octet-stream',
        fileNameHint: typeof d.fileNameHint === 'string' && d.fileNameHint !== '' ? d.fileNameHint : null,
        attempts: typeof d.attempts === 'number' ? d.attempts : 1,
      },
    });
  }
  const out: LostFilesByMessage = new Map();
  for (const { messageId, file } of byAttachment.values()) {
    const list = out.get(messageId) ?? [];
    list.push(file);
    out.set(messageId, list);
  }
  for (const list of out.values()) list.sort((a, b) => a.index - b.index);
  return out;
}
