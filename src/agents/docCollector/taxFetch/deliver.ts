import { createHash } from 'node:crypto';
import * as agentInstances from '../../../db/queries/agentInstances.js';
import * as clientDocuments from '../../../db/queries/clientDocuments.js';
import * as documentFiles from '../../../db/queries/documentFiles.js';
import * as emails from '../../../db/queries/emails.js';
import * as taxFetchSessions from '../../../db/queries/taxFetchSessions.js';
import * as users from '../../../db/queries/users.js';
import * as waSenders from '../../../db/queries/waSenders.js';
import { withClientLock } from '../../../db/withClientLock.js';
import { recordAudit } from '../../../audit/audit.js';
import { publishClientUpdated } from '../../../events/clientEvents.js';
import { removeFutureEmail } from '../../../orchestration/removeFutureEmail.js';
import { setFutureEmail } from '../../../orchestration/setFutureEmail.js';
import { formatFrom, resolveSenderMailbox } from '../../instanceEmail.js';
import { sendEmail } from '../../../resend/send.js';
import { uploadBlob } from '../../../storage/blob.js';
import { sendWhatsAppTextAndRecord } from '../../../twilio/sendAndRecord.js';
import { logger } from '../../../util/logger.js';
import type { ClientRow } from '../../../db/types.js';
import { sanitizeFilename, type FetchedDocument } from './types.js';
import type { TaxFetchSessionRow } from '../../../db/queries/taxFetchSessions.js';

/**
 * A successfully downloaded document lands here: store it on the platform
 * (blob + document_files + mark the checklist item collected) and email the
 * client a copy, then re-plan so the normal collection loop continues (and
 * derives goal-complete if this was the last document).
 *
 * The copy deliberately goes by EMAIL, not WhatsApp media: WhatsApp identity
 * is possession of a phone number (recyclable, stealable), so the document
 * rides the independent email channel while only the confirmation text goes
 * to the WhatsApp conversation the fetch ran in.
 */
export async function deliver(session: TaxFetchSessionRow, client: ClientRow, doc: FetchedDocument): Promise<void> {
  const sender = client.agent_instance_id ? await waSenders.getByInstanceId(client.agent_instance_id) : null;
  if (!sender || !client.wa_phone) {
    throw new Error('cannot deliver tax document: client is not WhatsApp-reachable');
  }
  const mailbox = await resolveSenderMailbox(client.agent_instance_id, client.user_id);
  const canEmail = Boolean(mailbox && client.email_address);
  if (!canEmail) {
    logger.warn('tax fetch: client not emailable, document stored on platform only', {
      clientId: client.id,
      sessionId: session.id,
      hasMailbox: Boolean(mailbox),
      hasEmail: Boolean(client.email_address),
    });
  }

  // The filename originates on the external site — never let it shape the key path.
  const blobKey = `clients/${client.id}/taxfetch-${session.id}/${sanitizeFilename(doc.filename)}`;
  await uploadBlob(blobKey, doc.buffer, doc.contentType);

  // Confirmation text first, so a timeline row exists to hang the file off of
  // (the prompt transcript groups files by their email_id).
  const message = await sendWhatsAppTextAndRecord(client.id, {
    from: sender.phone_number,
    to: client.wa_phone,
    body: canEmail
      ? 'הצלחתי למשוך את טופס ה-106 שלך מרשות המסים 🎉 שלחתי לך עותק למייל.'
      : 'הצלחתי למשוך את טופס ה-106 שלך מרשות המסים 🎉 המסמך נשמר והועבר לרואה החשבון.',
    reasoning: `tax fetch delivered (session ${session.id})`,
    agentInstanceId: client.agent_instance_id,
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

  // The file itself, as an email attachment on the client's collection thread.
  // Not recorded in the emails table (that table is the conversation the LLM
  // replays) — the WhatsApp confirmation above already tells the transcript a
  // copy went to the client's email.
  if (canEmail) {
    const instance = client.agent_instance_id ? await agentInstances.getById(client.agent_instance_id) : null;
    const accountant = client.user_id ? await users.getById(client.user_id) : null;
    const displayName = [accountant?.name, instance?.name].filter(Boolean).join(' – ') || null;
    const messageIds = await emails.listMessageIdsForClient(client.id);
    await sendEmail({
      from: formatFrom(displayName, mailbox!.email_address),
      to: client.email_address,
      subject: `טופס 106 לשנת ${session.tax_year}`,
      body: ['שלום,', '', `מצורף טופס ה-106 שלך לשנת ${session.tax_year}, שנמשך עבורך מרשות המסים.`].join('\n'),
      inReplyTo: messageIds.at(-1),
      references: messageIds.slice(-20),
      attachments: [{ filename: doc.filename, content: doc.buffer }],
    });
    recordAudit({
      actorType: 'agent',
      action: 'email.document_sent',
      agentInstanceId: client.agent_instance_id,
      clientId: client.id,
      targetType: 'document_file',
      targetId: file.id,
      detail: { clientName: client.name, to: client.email_address, filename: doc.filename },
    });
  }

  await taxFetchSessions.updateStatus(session.id, 'delivered', {
    documentFileId: file.id,
    deliveredAt: new Date(),
  });
  logger.info('tax fetch: delivered', { sessionId: session.id, clientId: client.id, fileId: file.id });
  recordAudit({
    actorType: 'agent',
    action: 'tax_fetch.document_delivered',
    agentInstanceId: client.agent_instance_id,
    clientId: client.id,
    targetType: 'tax_fetch_session',
    targetId: session.id,
    detail: { clientName: client.name, taxYear: session.tax_year, fileId: file.id, filename: doc.filename },
  });

  // Let the collector re-plan: mark-collected may have completed the goal, or a
  // follow-up for the remaining documents should be (re)scheduled.
  await withClientLock(client.id, async () => {
    await removeFutureEmail(client.id);
    await setFutureEmail(client.id);
  });
  publishClientUpdated(client.id);
}
