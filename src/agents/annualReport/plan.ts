import * as llmUsage from '../../db/queries/llmUsage.js';
import * as clients from '../../db/queries/clients.js';
import * as clientDocuments from '../../db/queries/clientDocuments.js';
import * as documentFiles from '../../db/queries/documentFiles.js';
import * as emails from '../../db/queries/emails.js';
import { getWaChannelState } from '../docCollector/plan.js';
import { sendClaimedDocumentsEmail } from '../docCollector/notifyAccountant.js';
import { fileMatchesDocument, isQuarantined, isVerifiedLegibleFile } from '../shared/fileEvidence.js';
import { buildPrompt, isInterviewComplete } from './prompt.js';
import { sendGoalCompleteEmail } from './notifyAccountant.js';
import { decide } from './decide.js';
import type { DecisionContext } from './decisionSchema.js';
import { publishClientUpdated } from '../../events/clientEvents.js';
import { scheduleDraftMessage } from '../../orchestration/scheduleDraftEmail.js';
import { zonedTimeToUtc } from '../../util/time.js';
import { env } from '../../config/env.js';
import { logger } from '../../util/logger.js';
import type { AgentContext } from '../types.js';

/** Dedup key for LLM-proposed document names: whitespace-collapsed, case-insensitive. */
function normalizeDocName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * One planning step for an annual-report client: run the interview/collection
 * prompt over the full thread, register any documents the interview just
 * determined are required, record what was provided, and either finish or
 * schedule the next message. Unlike the doc collector there is no legacy
 * "no documents configured" completion fallback — a client with zero rows can
 * never complete; the interview must produce the list first.
 */
export async function planAnnualReport(ctx: AgentContext): Promise<void> {
  const { client, accountant } = ctx;
  const clientId = client.id;
  const now = new Date();
  const history = await emails.listForClient(clientId);
  const documents = await clientDocuments.listForClient(clientId);
  const files = await documentFiles.listForClient(clientId);
  const waState = await getWaChannelState(client, now);
  const { systemInstruction, contents } = buildPrompt(client, accountant, history, documents, files, now, waState);
  const decisionCtx: DecisionContext = { whatsappAllowed: waState.allowed, windowOpen: waState.windowOpen, templates: waState.templates };
  const { decision, usage, model } = await decide(systemInstruction, contents, decisionCtx);

  // Bill the tokens to the owning accountant right away, so they count even if
  // acting on the decision fails below.
  if (client.user_id) {
    await llmUsage.add(client.user_id, client.agent_instance_id, model, usage);
  }

  if (decision.suspected_injection) {
    logger.warn('annual report: LLM flagged suspected prompt injection — suppressing state changes this cycle', {
      clientId,
      reasoning: decision.reasoning,
    });
  }

  // Register the documents the interview just determined are required. Duplicates
  // (the LLM re-proposing an existing row, or the same name twice in one answer)
  // are skipped. A volunteered file only makes the new row start out collected
  // when that file is verified (analyzed, legible, not quarantined) — the
  // analyzer couldn't have matched a document that didn't exist yet, so this is
  // the strongest evidence available here. Length clamps match the router's Zod limits.
  const fileById = new Map(files.map((f) => [f.id, f]));
  const knownNames = new Set(documents.map((d) => normalizeDocName(d.name)));
  let insertedTotal = 0;
  let insertedPending = 0;
  const addDocuments = decision.suspected_injection ? [] : decision.add_documents;
  for (const proposal of addDocuments) {
    const name = proposal.name.trim().replace(/\s+/g, ' ').slice(0, 200);
    if (!name) continue;
    const key = normalizeDocName(name);
    if (knownNames.has(key)) {
      logger.info('duplicate determined document skipped', { clientId, name });
      continue;
    }
    knownNames.add(key);
    const description = proposal.description?.trim().slice(0, 2000) || null;
    const row = await clientDocuments.insert({ clientId, name, description });
    insertedTotal += 1;
    const matchedFile = proposal.matched_file_id ? fileById.get(proposal.matched_file_id) : undefined;
    if (matchedFile && isVerifiedLegibleFile(matchedFile)) {
      await clientDocuments.markCollected(clientId, [row.id]);
      await documentFiles.linkToDocument(matchedFile.id, clientId, row.id);
    } else {
      insertedPending += 1;
    }
    logger.info('interview determined document', {
      clientId,
      documentId: row.id,
      name,
      collected: matchedFile !== undefined && isVerifiedLegibleFile(matchedFile),
    });
  }

  // Evidence-gated status updates, mirroring the doc collector: 'collected'
  // requires a verified file (analyzer match, or a planner pairing with a
  // verified legible file); a no-file claim lands as 'claimed' and waits for
  // the accountant. Unknown ids are ignored throughout.
  const pendingIds = new Set(documents.filter((d) => d.status === 'pending').map((d) => d.id));
  const documentIds = new Set(documents.map((d) => d.id));
  const proposedPairs = decision.suspected_injection
    ? []
    : decision.matched_files.filter((m) => fileById.has(m.file_id) && documentIds.has(m.document_id));
  const newlyCollected: string[] = [];
  const newlyClaimed: string[] = [];
  if (!decision.suspected_injection) {
    for (const id of decision.collected_document_ids) {
      if (!pendingIds.has(id)) continue;
      const strongMatch = files.some((f) => fileMatchesDocument(f, id));
      const paired = proposedPairs.find((m) => m.document_id === id);
      const pairedFile = paired ? fileById.get(paired.file_id) : undefined;
      if (strongMatch || (pairedFile && isVerifiedLegibleFile(pairedFile))) {
        newlyCollected.push(id);
      } else {
        newlyClaimed.push(id);
      }
    }
  }
  if (newlyCollected.length > 0) {
    await clientDocuments.markCollected(clientId, newlyCollected);
    logger.info('documents marked collected', { clientId, documentIds: newlyCollected });
  }
  if (newlyClaimed.length > 0) {
    await clientDocuments.markClaimed(clientId, newlyClaimed);
    logger.info('documents marked claimed (await accountant confirmation)', { clientId, documentIds: newlyClaimed });
    const claimedNames = documents.filter((d) => newlyClaimed.includes(d.id)).map((d) => d.name);
    sendClaimedDocumentsEmail(client, claimedNames).catch((err) =>
      logger.error('claimed-documents notification failed', err, { clientId }),
    );
  }

  // File a received file under the determined document it satisfies. Quarantined
  // files (suspected injection / illegible) are never filed anywhere.
  for (const match of proposedPairs) {
    const file = fileById.get(match.file_id);
    if (!file || isQuarantined(file)) continue;
    await documentFiles.linkToDocument(match.file_id, clientId, match.document_id);
    logger.info('file linked to document', { clientId, fileId: match.file_id, documentId: match.document_id });
  }

  if (insertedTotal > 0 || newlyCollected.length > 0 || newlyClaimed.length > 0) {
    publishClientUpdated(clientId);
  }

  // The interview flag is sticky: once the LLM declares the interview covered,
  // later passes only chase the remaining documents. Never latched on a
  // suspected-injection cycle — injected text must not be able to close the interview.
  const wasInterviewComplete = isInterviewComplete(client);
  if (decision.interview_complete && !wasInterviewComplete && !decision.suspected_injection) {
    await clients.markInterviewComplete(clientId);
    logger.info('interview marked complete', { clientId, reasoning: decision.reasoning });
  }
  const interviewDone = wasInterviewComplete || (decision.interview_complete && !decision.suspected_injection);

  // Completion is derived, never trusted from the decision field: the interview
  // must be finished, at least one document must exist, and every document must
  // be collected — 'claimed' rows still need the accountant's confirmation.
  const totalDocs = documents.length + insertedTotal;
  const collectedCount =
    documents.filter((d) => d.status === 'collected').length + newlyCollected.length + (insertedTotal - insertedPending);
  const stillPending = totalDocs - collectedCount;
  const allCollected = interviewDone && totalDocs > 0 && stillPending === 0;

  if (allCollected) {
    await clients.updateGoalStatus(clientId, 'complete');
    publishClientUpdated(clientId);
    logger.info('goal complete', { clientId, reasoning: decision.reasoning });
    const allDocuments = await clientDocuments.listForClient(clientId);
    sendGoalCompleteEmail(client, allDocuments).catch((err) =>
      logger.error('goal-complete notification failed', err, { clientId }),
    );
    return;
  }

  if (decision.decision === 'goal_complete') {
    // Contract violation (the prompt forbids goal_complete mid-interview or with pending
    // documents): there is no drafted message to schedule, so fail loudly and let the
    // caller's retry path re-ask.
    throw new Error(
      `setFutureEmail: LLM returned goal_complete but interview is ${interviewDone ? 'done' : 'still open'} with ` +
        `${stillPending}/${totalDocs} document(s) pending for client ${clientId}`,
    );
  }

  // The LLM answers with a wall-clock datetime in the accountant's timezone.
  const sendAtUtc = zonedTimeToUtc(decision.send_at, env.ACCOUNTANT_TIMEZONE);
  const delayMs = sendAtUtc.getTime() - Date.now();
  if (delayMs < 0) {
    logger.warn('LLM send_at is in the past; sending immediately', { clientId, send_at: decision.send_at });
  }
  const message = decision.message;
  await scheduleDraftMessage(clientId, {
    channel: message.channel,
    subject: message.channel === 'email' ? message.subject : '',
    body: message.channel === 'email' || message.kind === 'freeform' ? message.body : message.renderedBody,
    waContentSid: message.channel === 'whatsapp' && message.kind === 'template' ? message.contentSid : null,
    waContentVariables: message.channel === 'whatsapp' && message.kind === 'template' ? message.variables : null,
    delayMs: Math.max(0, delayMs),
    reasoning: decision.reasoning,
  });
  logger.info('follow-up scheduled', {
    clientId,
    channel: message.channel,
    kind: message.channel === 'whatsapp' ? message.kind : 'email',
    send_at: decision.send_at,
    send_at_utc: sendAtUtc.toISOString(),
    reasoning: decision.reasoning,
  });
}
