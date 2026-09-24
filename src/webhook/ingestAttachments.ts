import { resend } from '../resend/client.js';
import { ingestInboundFile, type InboundFileContext } from './ingestInboundFile.js';

/** Attachment metadata as embedded in the Resend receiving GET response. */
export interface InboundAttachmentMeta {
  id: string;
  filename: string | null;
  size: number;
  content_type: string;
  content_id: string | null;
  content_disposition: string | null;
}

/** Blob names stay predictable and URL-safe regardless of what the client's mail app sent. */
function sanitizeFilename(filename: string | null): string {
  const safe = (filename ?? '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[._]+/, '').slice(0, 120);
  return safe || 'attachment';
}

/**
 * Inline-referenced parts (content_id, no explicit `attachment` disposition)
 * this small are signature logos, social icons and spacers. Larger inline
 * parts are kept: Apple Mail sends real photo attachments as inline parts
 * with a content_id, and dropping on disposition alone loses those.
 */
const INLINE_JUNK_MAX_BYTES = 50 * 1024;

/**
 * Downloads each real attachment from Resend and persists it (see
 * ingestInboundFile: fetch + store retried as a unit, a lost file becomes a
 * `file.ingest_failed` step). Failures are per-attachment — the webhook has
 * already been acked, so there is no retry to throw to.
 *
 * Returns the number of newly stored files.
 */
export async function ingestAttachments(
  ctx: Omit<InboundFileContext, 'channel'>,
  resendEmailId: string,
  attachments: InboundAttachmentMeta[],
): Promise<number> {
  let stored = 0;
  for (const [index, att] of attachments.entries()) {
    // Skip small parts embedded inline in the HTML body (signature logos,
    // embedded images). A content_id alone is not enough to tell: Gmail stamps
    // one on real photo attachments too, so an explicit `attachment`
    // disposition always wins; and Apple Mail marks real photos inline, so
    // only inline parts small enough to be decorative are dropped.
    const disposition = (att.content_disposition ?? '').trim().toLowerCase();
    const inline = Boolean(att.content_id) && !disposition.startsWith('attachment');
    // A missing/zero size drops too — real photos always report one.
    if (inline && !(att.size > INLINE_JUNK_MAX_BYTES)) continue;

    const inserted = await ingestInboundFile(
      { ...ctx, channel: 'email' },
      {
        providerAttachmentId: att.id,
        index,
        contentType: att.content_type || 'application/octet-stream',
        filename: sanitizeFilename(att.filename),
        fileNameHint: att.filename,
        download: () => downloadResendAttachment(resendEmailId, att.id),
      },
    );
    if (inserted) stored += 1;
  }
  return stored;
}

/** The signed download url is short-lived, so both calls belong to one attempt. */
async function downloadResendAttachment(resendEmailId: string, attachmentId: string): Promise<Buffer> {
  const { data, error } = await resend.emails.receiving.attachments.get({ emailId: resendEmailId, id: attachmentId });
  if (error || !data) {
    throw new Error(`fetch attachment meta failed: ${error?.name ?? 'unknown'} ${error?.message ?? ''}`);
  }
  const response = await fetch(data.download_url);
  if (!response.ok) throw new Error(`attachment download returned ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}
