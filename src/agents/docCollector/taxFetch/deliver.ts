import { createHash } from 'node:crypto';
import * as clientDocuments from '../../../db/queries/clientDocuments.js';
import * as documentFiles from '../../../db/queries/documentFiles.js';
import * as taxFetchSessions from '../../../db/queries/taxFetchSessions.js';
import * as waSenders from '../../../db/queries/waSenders.js';
import { withClientLock } from '../../../db/withClientLock.js';
import { publishClientUpdated } from '../../../events/clientEvents.js';
import { removeFutureEmail } from '../../../orchestration/removeFutureEmail.js';
import { setFutureEmail } from '../../../orchestration/setFutureEmail.js';
import { uploadBlob } from '../../../storage/blob.js';
import { buildSignedMediaUrl } from '../../../storage/mediaUrl.js';
import { sendWhatsAppMedia } from '../../../twilio/send.js';
import { sendWhatsAppTextAndRecord } from '../../../twilio/sendAndRecord.js';
import { logger } from '../../../util/logger.js';
import type { ClientRow } from '../../../db/types.js';
import type { FetchedDocument } from '../../../browser/providers/types.js';
import type { TaxFetchSessionRow } from '../../../db/queries/taxFetchSessions.js';

/**
 * A successfully downloaded document lands here: store it on the platform
 * (blob + document_files + mark the checklist item collected) and send a copy
 * to the client over WhatsApp, then re-plan so the normal collection loop
 * continues (and derives goal-complete if this was the last document).
 */
export async function deliver(session: TaxFetchSessionRow, client: ClientRow, doc: FetchedDocument): Promise<void> {
  const sender = client.agent_instance_id ? await waSenders.getByInstanceId(client.agent_instance_id) : null;
  if (!sender || !client.wa_phone) {
    throw new Error('cannot deliver tax document: client is not WhatsApp-reachable');
  }

  const blobKey = `clients/${client.id}/taxfetch-${session.id}/${doc.filename}`;
  await uploadBlob(blobKey, doc.buffer, doc.contentType);

  // Confirmation text first, so a timeline row exists to hang the file off of
  // (the prompt transcript groups files by their email_id).
  const message = await sendWhatsAppTextAndRecord(client.id, {
    from: sender.phone_number,
    to: client.wa_phone,
    body: 'הצלחתי למשוך את טופס ה-106 שלך מרשות המסים 🎉 שולח לך אותו עכשיו.',
    reasoning: `tax fetch delivered (session ${session.id})`,
  });

  const file = await documentFiles.insertIfNew({
    clientId: client.id,
    emailId: message.id,
    providerAttachmentId: `taxfetch-${session.id}`,
    blobKey,
    filename: doc.filename,
    contentType: doc.contentType,
    sizeBytes: doc.buffer.length,
    sha256: createHash('sha256').update(doc.buffer).digest('hex'),
  });
  if (!file) throw new Error(`tax fetch: document_files insert returned no row for session ${session.id}`);

  if (session.client_document_id) {
    await documentFiles.linkToDocument(file.id, client.id, session.client_document_id);
    await clientDocuments.markCollected(client.id, [session.client_document_id]);
  }

  // The file itself, as a WhatsApp media message (Twilio fetches the signed URL).
  await sendWhatsAppMedia({
    from: sender.phone_number,
    to: client.wa_phone,
    body: `טופס 106 לשנת ${session.tax_year}`,
    mediaUrl: buildSignedMediaUrl(file.id),
  });

  await taxFetchSessions.updateStatus(session.id, 'delivered', {
    documentFileId: file.id,
    deliveredAt: new Date(),
  });
  logger.info('tax fetch: delivered', { sessionId: session.id, clientId: client.id, fileId: file.id });

  // Let the collector re-plan: mark-collected may have completed the goal, or a
  // follow-up for the remaining documents should be (re)scheduled.
  await withClientLock(client.id, async () => {
    await removeFutureEmail(client.id);
    await setFutureEmail(client.id);
  });
  publishClientUpdated(client.id);
}
