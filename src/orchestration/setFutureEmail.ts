import * as clients from '../db/queries/clients.js';
import * as users from '../db/queries/users.js';
import * as clientDocuments from '../db/queries/clientDocuments.js';
import * as documentFiles from '../db/queries/documentFiles.js';
import * as emails from '../db/queries/emails.js';
import { buildPrompt } from '../gemini/prompt.js';
import { getPromptTemplate } from '../gemini/promptSettings.js';
import { decide } from '../gemini/decide.js';
import { scheduleDraftEmail } from './scheduleDraftEmail.js';
import { hoursToMs } from '../util/time.js';
import { logger } from '../util/logger.js';

/** Asks the LLM, given the full thread and required-documents list, which documents were just provided and whether a follow-up is needed, and acts on it. */
export async function setFutureEmail(clientId: string): Promise<void> {
  const client = await clients.getById(clientId);
  if (!client) throw new Error(`setFutureEmail: client ${clientId} not found`);
  if (client.goal_status === 'complete') return;

  const accountant = client.user_id ? await users.getById(client.user_id) : null;
  const history = await emails.listForClient(clientId);
  const documents = await clientDocuments.listForClient(clientId);
  const files = await documentFiles.listForClient(clientId);
  const { template } = await getPromptTemplate(client.user_id);
  const { systemInstruction, contents } = buildPrompt(client, accountant, history, documents, files, new Date(), template);
  const decision = await decide(systemInstruction, contents);

  // Record which pending documents the LLM saw the client provide (unknown ids are ignored).
  const pendingIds = new Set(documents.filter((d) => d.status === 'pending').map((d) => d.id));
  const newlyCollected = decision.collected_document_ids.filter((id) => pendingIds.has(id));
  if (newlyCollected.length > 0) {
    await clientDocuments.markCollected(clientId, newlyCollected);
    logger.info('documents marked collected', { clientId, documentIds: newlyCollected });
  }

  // File a received file under the required document it satisfies (unknown ids are ignored).
  const fileIds = new Set(files.map((f) => f.id));
  const documentIds = new Set(documents.map((d) => d.id));
  for (const match of decision.matched_files) {
    if (!fileIds.has(match.file_id) || !documentIds.has(match.document_id)) continue;
    await documentFiles.linkToDocument(match.file_id, clientId, match.document_id);
    logger.info('file linked to document', { clientId, fileId: match.file_id, documentId: match.document_id });
  }

  // Completion is derived from the documents, not the LLM's decision field: complete iff
  // every required document is collected. Clients with no configured documents fall back
  // to trusting the decision field (legacy behavior).
  const stillPending = pendingIds.size - newlyCollected.length;
  const allCollected = documents.length > 0 ? stillPending === 0 : decision.decision === 'goal_complete';

  if (allCollected) {
    await clients.updateGoalStatus(clientId, 'complete');
    logger.info('goal complete', { clientId, reasoning: decision.reasoning });
    return;
  }

  if (decision.decision === 'goal_complete') {
    // Contract violation (prompt forbids goal_complete with pending documents): there is no
    // drafted email to schedule, so fail loudly and let the caller's retry path re-ask.
    throw new Error(
      `setFutureEmail: LLM returned goal_complete but ${stillPending} document(s) still pending for client ${clientId}`,
    );
  }

  await scheduleDraftEmail(clientId, {
    subject: decision.email_subject,
    body: decision.email_body,
    delayMs: hoursToMs(decision.wait_hours),
  });
  logger.info('follow-up scheduled', { clientId, wait_hours: decision.wait_hours, reasoning: decision.reasoning });
}
