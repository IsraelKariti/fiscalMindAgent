import { createHash } from 'node:crypto';
import * as agentInstances from '../../../db/queries/agentInstances.js';
import * as clientDocuments from '../../../db/queries/clientDocuments.js';
import * as documentFiles from '../../../db/queries/documentFiles.js';
import * as emails from '../../../db/queries/emails.js';
import * as documentFetchSessions from '../../../db/queries/documentFetchSessions.js';
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
import { isSyntheticWaEmail } from '../../../util/syntheticEmail.js';
import { sendWhatsAppTextAndRecord } from '../../../twilio/sendAndRecord.js';
import { logger } from '../../../util/logger.js';
import type { ClientRow, DocumentFileRow } from '../../../db/types.js';
import { verifyBatchAndReplan } from '../../declarationOfCapital/verifyDocument.js';
import { planFetchedRows } from './fetchedRows.js';
import { getProviderSpec, typeOwnsFetched } from './providers.js';
import { sanitizeFilename, type FetchedDocument } from './types.js';
import type { DocumentFetchSessionRow } from '../../../db/queries/documentFetchSessions.js';

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
export async function deliver(session: DocumentFetchSessionRow, client: ClientRow, docs: FetchedDocument[]): Promise<void> {
  if (docs.length === 0) throw new Error(`document fetch: nothing to deliver for session ${session.id}`);
  const sender = client.agent_instance_id ? await waSenders.getByInstanceId(client.agent_instance_id) : null;
  if (!sender || !client.wa_phone) {
    throw new Error('cannot deliver tax documents: client is not WhatsApp-reachable');
  }
  const mailbox = await resolveSenderMailbox(client.agent_instance_id, client.user_id);
  // Synthetic wa-*@wa.invalid placeholders (WhatsApp-only clients) are not real addresses.
  const canEmail = Boolean(mailbox && client.email_address && !isSyntheticWaEmail(client.email_address));
  if (!canEmail) {
    logger.warn('document fetch: client not emailable, documents stored on platform only', {
      clientId: client.id,
      sessionId: session.id,
      hasMailbox: Boolean(mailbox),
      hasEmail: Boolean(client.email_address),
    });
  }

  const spec = getProviderSpec(session.provider);
  const single = docs.length === 1;

  // A provider that takes everything it finds (openspec `phoenix-fetch`) may
  // have fetched a kind the list lacks: those get their own row below, and the
  // confirmation tells the client after the fact — so the plan comes first.
  const clientDocs = await clientDocuments.listForClient(client.id);
  const rowPlans = planFetchedRows(spec, docs, clientDocs, session.tax_year);
  const plannedDocIndexes = new Set(rowPlans.flatMap((p) => p.docIndexes));

  // Confirmation text first, so a timeline row exists to hang the files off of
  // (the prompt transcript groups files by their email_id).
  const message = await sendWhatsAppTextAndRecord(client.id, {
    from: sender.phone_number,
    to: client.wa_phone,
    body: spec.delivery.waConfirmation(
      docs,
      canEmail,
      rowPlans.map((p) => p.kind),
    ),
    reasoning: `document fetch delivered (session ${session.id}, ${docs.length} document${single ? '' : 's'})`,
    agentInstanceId: client.agent_instance_id,
  });

  // Resolve which pending checklist item each fetched file satisfies. A session
  // may cover several document types (Altshuler pension + study fund); each file
  // is linked to the pending required document its type matches, so both get
  // marked collected independently. session.document_keys scopes which types are
  // in play; session.client_document_id is the legacy single-doc fallback.
  const activeKeys = session.document_keys ?? spec.documents.map((t) => t.key);
  const targetDocIdFor = (doc: FetchedDocument): string | null => {
    const type = spec.documents.find((t) => activeKeys.includes(t.key) && typeOwnsFetched(t, doc));
    const match = type ? clientDocs.find((d) => type.matchesRequiredDocument(d)) : null;
    return match?.id ?? session.client_document_id;
  };
  const collectedDocIds = new Set<string>();
  /** Document → the file that satisfied it, for the verification pipeline (last file wins on multi-file docs). */
  const verifyPairs = new Map<string, string>();

  const files: DocumentFileRow[] = [];
  const usedNames = new Set<string>();
  for (const [i, doc] of docs.entries()) {
    // The filename originates on the external site — never let it shape the key
    // path, and keep names unique within the session's blob directory.
    let safeName = sanitizeFilename(doc.filename);
    if (usedNames.has(safeName)) safeName = `${i + 1}_${safeName}`;
    usedNames.add(safeName);
    const blobKey = `clients/${client.id}/documentfetch-${session.id}/${safeName}`;
    await uploadBlob(blobKey, doc.buffer, doc.contentType);

    const file = await documentFiles.insertIfNew({
      clientId: client.id,
      emailId: message.id,
      // Pre-multi-download sessions used the bare `documentfetch-<session>` id; the
      // `-<n>` suffix keeps each employer's form its own idempotency key.
      providerAttachmentId: single ? `documentfetch-${session.id}` : `documentfetch-${session.id}-${i + 1}`,
      blobKey,
      filename: doc.filename,
      label: spec.delivery.fileLabel(doc, session.tax_year),
      contentType: doc.contentType,
      sizeBytes: doc.buffer.length,
      sha256: createHash('sha256').update(doc.buffer).digest('hex'),
      // The platform fetched this file and links it below; the inbound content
      // analyzer (which matches a client-sent file to a document) never runs on it.
      analysisStatus: 'not_needed',
    });
    if (!file) throw new Error(`document fetch: document_files insert returned no row for session ${session.id}`);
    files.push(file);

    // A file of a kind that gets its own row is linked after that row exists.
    if (plannedDocIndexes.has(i)) continue;
    const targetDocId = targetDocIdFor(doc);
    if (targetDocId) {
      await documentFiles.linkToDocument(file.id, client.id, targetDocId);
      collectedDocIds.add(targetDocId);
      verifyPairs.set(targetDocId, file.id);
    }
  }

  // Rows for the kinds the list lacked (openspec `phoenix-fetch`): created by
  // code with the fetch as evidence, then the kind's files are attached and
  // the row goes through the same verification as the rest. A lost race (the
  // target row changed under us) falls back to today's linking.
  for (const plan of rowPlans) {
    const planFiles = plan.docIndexes.map((i) => files[i]!);
    const evidence = {
      source: 'fetched_file' as const,
      file_id: planFiles[0]!.id,
      provider: spec.id,
      issuer: spec.siteNameHe,
      session_id: session.id,
    };
    const instance = { name: plan.name, description: plan.description, paperKey: plan.paperKey };
    const created =
      plan.action === 'resolve'
        ? await clientDocuments.resolveRequired(plan.targetRowId, client.id, [instance], evidence)
        : await clientDocuments.addInstances(plan.targetRowId, client.id, [instance], evidence);
    const row = created?.[0] ?? null;
    if (!row) {
      logger.warn('document fetch: row creation for a fetched kind lost its target, falling back to plain linking', {
        clientId: client.id,
        sessionId: session.id,
        kind: plan.kind,
        action: plan.action,
        targetRowId: plan.targetRowId,
      });
      for (const i of plan.docIndexes) {
        const targetDocId = targetDocIdFor(docs[i]!);
        if (!targetDocId) continue;
        await documentFiles.linkToDocument(files[i]!.id, client.id, targetDocId);
        collectedDocIds.add(targetDocId);
        verifyPairs.set(targetDocId, files[i]!.id);
      }
      continue;
    }
    for (const file of planFiles) {
      await documentFiles.linkToDocument(file.id, client.id, row.id);
      verifyPairs.set(row.id, file.id);
    }
    collectedDocIds.add(row.id);
    logger.info('document fetch: checklist row created for a fetched kind', {
      clientId: client.id,
      sessionId: session.id,
      kind: plan.kind,
      action: plan.action,
      documentId: row.id,
      name: row.name,
      files: planFiles.length,
    });
    recordAudit({
      actorType: 'agent',
      action: 'document_fetch.document_created',
      agentInstanceId: client.agent_instance_id,
      clientId: client.id,
      targetType: 'client_document',
      targetId: row.id,
      detail: {
        clientName: client.name,
        name: row.name,
        kind: plan.kind,
        action: plan.action,
        sessionId: session.id,
        provider: spec.id,
        fileIds: planFiles.map((f) => f.id),
      },
    });
  }
  if (collectedDocIds.size > 0) {
    await clientDocuments.markCollected(client.id, [...collectedDocIds]);
    // Verification pipeline (capital declaration): machine-fetched documents
    // are verified like any other received file — as ONE batch, followed by
    // one planning cycle that reports the outcomes (openspec
    // `verification-reply`). Fire-and-forget — delivery must complete regardless.
    const owningInstance = client.agent_instance_id ? await agentInstances.getById(client.agent_instance_id) : null;
    if (owningInstance?.agent_type === 'declaration_of_capital') {
      const targets = [...verifyPairs].map(([documentId, fileId]) => ({ documentId, fileId }));
      void verifyBatchAndReplan(client, owningInstance, targets).catch((err) =>
        logger.error('document-fetch verification pipeline failed', err, { clientId: client.id }),
      );
    }
  }

  // The files themselves, as email attachments on the client's collection
  // thread. Not recorded in the emails table (that table is the conversation
  // the LLM replays) — the WhatsApp confirmation above already tells the
  // transcript copies went to the client's email.
  if (canEmail) {
    const instance = client.agent_instance_id ? await agentInstances.getById(client.agent_instance_id) : null;
    const accountant = client.user_id ? await users.getById(client.user_id) : null;
    const displayName =
      [accountant?.hebrew_name?.trim() || accountant?.name, instance?.name].filter(Boolean).join(' – ') || null;
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
  await documentFetchSessions.updateStatus(session.id, 'delivered', {
    documentFileId: firstFile.id,
    deliveredAt: new Date(),
  });
  logger.info('document fetch: delivered', {
    sessionId: session.id,
    clientId: client.id,
    fileIds: files.map((f) => f.id),
    count: files.length,
  });
  recordAudit({
    actorType: 'agent',
    action: 'document_fetch.document_delivered',
    agentInstanceId: client.agent_instance_id,
    clientId: client.id,
    targetType: 'document_fetch_session',
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
    await removeFutureEmail(client.id, 'document_fetch');
    await setFutureEmail(client.id, 'document_fetch');
  });
  publishClientUpdated(client.id);
}
