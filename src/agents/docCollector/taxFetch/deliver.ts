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
import { getProviderSpec } from './providers.js';
import { sanitizeFilename, type FetchedDocument } from './types.js';
import type { TaxFetchSessionRow } from '../../../db/queries/taxFetchSessions.js';

/**
 * The successfully downloaded documents land here: store them on the platform
 * (blobs + document_files + mark the checklist item collected) and email the
 * client a copy, then re-plan so the normal collection loop continues (and
 * derives goal-complete if this was the last document). A fetch may yield
 * several documents (e.g. one Form 106 per employer plus the salary summary) —
 * all of them satisfy the single checklist item, each stored as its own file
 * with a label the provider spec derives (e.g. the employer name exactly as
 * the site spells it). All client-facing wording comes from the session
 * provider's spec (providers.ts).
 *
 * The copies deliberately go by EMAIL, not WhatsApp media: WhatsApp identity
 * is possession of a phone number (recyclable, stealable), so the documents
 * ride the independent email channel while only the confirmation text goes
 * to the WhatsApp conversation the fetch ran in.
 */
export async function deliver(session: TaxFetchSessionRow, client: ClientRow, docs: FetchedDocument[]): Promise<void> {
  if (docs.length === 0) throw new Error(`tax fetch: nothing to deliver for session ${session.id}`);
  const sender = client.agent_instance_id ? await waSenders.getByInstanceId(client.agent_instance_id) : null;
  if (!sender || !client.wa_phone) {
    throw new Error('cannot deliver tax documents: client is not WhatsApp-reachable');
  }
  const mailbox = await resolveSenderMailbox(client.agent_instance_id, client.user_id);
  const canEmail = Boolean(mailbox && client.email_address);
  if (!canEmail) {
    logger.warn('tax fetch: client not emailable, documents stored on platform only', {
      clientId: client.id,
      sessionId: session.id,
      hasMailbox: Boolean(mailbox),
      hasEmail: Boolean(client.email_address),
    });
  }

  const spec = getProviderSpec(session.provider);
  const single = docs.length === 1;

  // Confirmation text first, so a timeline row exists to hang the files off of
  // (the prompt transcript groups files by their email_id).
  const message = await sendWhatsAppTextAndRecord(client.id, {
    from: sender.phone_number,
    to: client.wa_phone,
    body: spec.delivery.waConfirmation(docs, canEmail),
    reasoning: `tax fetch delivered (session ${session.id}, ${docs.length} document${single ? '' : 's'})`,
    agentInstanceId: client.agent_instance_id,
  });

  const files = [];
  const usedNames = new Set<string>();
  for (const [i, doc] of docs.entries()) {
    // The filename originates on the external site — never let it shape the key
    // path, and keep names unique within the session's blob directory.
    let safeName = sanitizeFilename(doc.filename);
    if (usedNames.has(safeName)) safeName = `${i + 1}_${safeName}`;
    usedNames.add(safeName);
    const blobKey = `clients/${client.id}/taxfetch-${session.id}/${safeName}`;
    await uploadBlob(blobKey, doc.buffer, doc.contentType);

    const file = await documentFiles.insertIfNew({
      clientId: client.id,
      emailId: message.id,
      // Pre-multi-download sessions used the bare `taxfetch-<session>` id; the
      // `-<n>` suffix keeps each employer's form its own idempotency key.
      providerAttachmentId: single ? `taxfetch-${session.id}` : `taxfetch-${session.id}-${i + 1}`,
      blobKey,
      filename: doc.filename,
      label: spec.delivery.fileLabel(doc, session.tax_year),
      contentType: doc.contentType,
      sizeBytes: doc.buffer.length,
      sha256: createHash('sha256').update(doc.buffer).digest('hex'),
    });
    if (!file) throw new Error(`tax fetch: document_files insert returned no row for session ${session.id}`);
    files.push(file);

    if (session.client_document_id) {
      await documentFiles.linkToDocument(file.id, client.id, session.client_document_id);
    }
  }
  if (session.client_document_id) {
    await clientDocuments.markCollected(client.id, [session.client_document_id]);
  }

  // The files themselves, as email attachments on the client's collection
  // thread. Not recorded in the emails table (that table is the conversation
  // the LLM replays) — the WhatsApp confirmation above already tells the
  // transcript copies went to the client's email.
  if (canEmail) {
    const instance = client.agent_instance_id ? await agentInstances.getById(client.agent_instance_id) : null;
    const accountant = client.user_id ? await users.getById(client.user_id) : null;
    const displayName = [accountant?.name, instance?.name].filter(Boolean).join(' – ') || null;
    const messageIds = await emails.listMessageIdsForClient(client.id);
    await sendEmail({
      from: formatFrom(displayName, mailbox!.email_address),
      to: client.email_address,
      subject: spec.delivery.emailSubject(docs, session.tax_year),
      body: ['שלום,', '', ...spec.delivery.emailBodyLines(docs, session.tax_year)].join('\n'),
      inReplyTo: messageIds.at(-1),
      references: messageIds.slice(-20),
      attachments: docs.map((doc) => ({ filename: doc.filename, content: doc.buffer })),
    });
    for (const [i, file] of files.entries()) {
      recordAudit({
        actorType: 'agent',
        action: 'email.document_sent',
        agentInstanceId: client.agent_instance_id,
        clientId: client.id,
        targetType: 'document_file',
        targetId: file.id,
        detail: { clientName: client.name, to: client.email_address, filename: file.filename, label: file.label },
      });
    }
  }

  const firstFile = files[0]!;
  await taxFetchSessions.updateStatus(session.id, 'delivered', {
    documentFileId: firstFile.id,
    deliveredAt: new Date(),
  });
  logger.info('tax fetch: delivered', {
    sessionId: session.id,
    clientId: client.id,
    fileIds: files.map((f) => f.id),
    count: files.length,
  });
  recordAudit({
    actorType: 'agent',
    action: 'tax_fetch.document_delivered',
    agentInstanceId: client.agent_instance_id,
    clientId: client.id,
    targetType: 'tax_fetch_session',
    targetId: session.id,
    detail: {
      clientName: client.name,
      taxYear: session.tax_year,
      fileIds: files.map((f) => f.id),
      filenames: files.map((f) => f.filename),
      employers: docs.map((d) => d.employerName).filter(Boolean),
    },
  });

  // Let the collector re-plan: mark-collected may have completed the goal, or a
  // follow-up for the remaining documents should be (re)scheduled.
  await withClientLock(client.id, async () => {
    await removeFutureEmail(client.id);
    await setFutureEmail(client.id);
  });
  publishClientUpdated(client.id);
}
