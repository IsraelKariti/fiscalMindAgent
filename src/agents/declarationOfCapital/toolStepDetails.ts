import { evidenceQuote, type ApprovedFileEvidence, type EvidenceRef } from './decisionSchema.js';
import type { ParsedToolCall } from './decisionTools.js';
import type { RefusedTie } from './fileTies.js';
import { applicableFilePairs, isQuarantined } from '../shared/fileEvidence.js';
import type { DocumentFileRow } from '../../db/types.js';

/**
 * The audit detail of each tool-call step the planner records (plan.ts,
 * openspec `conversation-trace`): one step per accepted call of the answer,
 * named after the tool, carrying the call's parameters (every document and
 * file id next to its name) and the outcome of its execution. Pure builders so
 * the shape the trace modal reads is pinned by a test. `reason` is the short
 * outcome line the trace row shows beside the step name.
 */

/** Resolves a document or file id to its display name; the id itself when unknown. */
export type NameLookup = (id: string) => string | null | undefined;

const named = (lookup: NameLookup, id: string): string => lookup(id) ?? id;
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

/** The call's own evidence as the trace shows it: the client's quote, or the file the planner cited instead. */
export function callEvidence(args: Record<string, unknown>): { quote?: string; messageId?: string; provenByFileId?: string } {
  const out: { quote?: string; messageId?: string; provenByFileId?: string } = {};
  if (str(args.evidence_quote) !== '') out.quote = str(args.evidence_quote);
  if (str(args.evidence_message_id) !== '') out.messageId = str(args.evidence_message_id);
  if (str(args.proven_by_file_id) !== '') out.provenByFileId = str(args.proven_by_file_id);
  return out;
}

/**
 * What an addition, resolution or retirement rested on after validation: the
 * client's quote, or the approved property paper / self-evident file the
 * planner cited instead — then `quote` names the file and the proven fact.
 */
export function evidenceDetail(evidence: EvidenceRef): { quote: string; provenByFileId?: string } {
  const quote = evidenceQuote(evidence);
  if (quote !== null) return { quote };
  if ('source' in evidence && evidence.source === 'self_evident_file') {
    const who = evidence.matched === 'client' ? 'על שם הלקוח' : 'על שם בן/בת הזוג';
    const employer = evidence.employer ? `, מעסיק ${evidence.employer}` : '';
    return { quote: `נוצר מקובץ ${who} (${evidence.issuer}${employer})`, provenByFileId: evidence.file_id };
  }
  const file = evidence as ApprovedFileEvidence;
  const fact = file.fact === 'seller_private' ? 'המוכר אדם פרטי' : 'המוכר קבלן / חברה';
  return { quote: `הוכח בקובץ שאושר (${fact})`, provenByFileId: file.file_id };
}

/** The header every tool step carries: the tool and, for a continued answer, the turn that made the call. */
export function toolHeader(call: ParsedToolCall): { tool: string; turn?: number } {
  return { tool: call.name, ...(call.turn !== undefined ? { turn: call.turn } : {}) };
}

export function resolveDocumentDetail(
  call: ParsedToolCall,
  docName: NameLookup,
  outcome: { applied: boolean; evidence: EvidenceRef | null; createdNames: string[] },
) {
  const id = str(call.args.document_id);
  const resolution = str(call.args.resolution);
  const created = outcome.createdNames;
  return {
    ...toolHeader(call),
    documentId: id,
    name: named(docName, id),
    resolution,
    ...(outcome.evidence ? evidenceDetail(outcome.evidence) : callEvidence(call.args)),
    ...(created.length > 0 ? { instances: created } : {}),
    applied: outcome.applied,
    reason: outcome.applied ? `resolved ${resolution}${created.length > 0 ? ` · ${created.length} rows` : ''}` : 'no change: the row could not be resolved',
  };
}

export function addInstanceDetail(
  call: ParsedToolCall,
  docName: NameLookup,
  fileName: NameLookup,
  outcome: {
    row: { id: string; name: string; status: string } | null;
    evidence: EvidenceRef | null;
    acceptedFileIds: readonly string[];
    refused: readonly RefusedTie[];
  },
) {
  const anchorId = str(call.args.anchor_document_id);
  const instanceName = str(call.args.name);
  const namedFiles = strs(call.args.file_ids);
  const row = outcome.row;
  const accepted = outcome.acceptedFileIds.map((id) => named(fileName, id));
  const refused = outcome.refused.map((r) => `${named(fileName, r.file_id)} (${r.reason})`);
  const claimed = row?.status === 'claimed';
  return {
    ...toolHeader(call),
    anchorId,
    anchorName: named(docName, anchorId),
    instanceName,
    ...(str(call.args.description) !== '' ? { description: str(call.args.description) } : {}),
    alreadyProvided: Boolean(call.args.already_provided),
    ...(str(call.args.paper_key) !== '' ? { paperKey: str(call.args.paper_key) } : {}),
    ...(outcome.evidence ? evidenceDetail(outcome.evidence) : callEvidence(call.args)),
    ...(namedFiles.length > 0 ? { fileIds: namedFiles, fileNames: namedFiles.map((id) => named(fileName, id)) } : {}),
    ...(row ? { documentId: row.id, name: row.name, status: row.status } : {}),
    ...(accepted.length > 0 ? { acceptedFiles: accepted } : {}),
    ...(refused.length > 0 ? { refusedFiles: refused } : {}),
    applied: row !== null,
    reason: row
      ? `created "${row.name}"${claimed ? ' · claimed' : ''}${accepted.length > 0 ? ` · ${accepted.length} file${accepted.length === 1 ? '' : 's'}` : ''}${refused.length > 0 ? ` · ${refused.length} refused` : ''}`
      : 'no change: the row was not created',
  };
}

export function retireDocumentDetail(call: ParsedToolCall, docName: NameLookup, outcome: { applied: boolean; evidence: EvidenceRef | null }) {
  const id = str(call.args.document_id);
  return {
    ...toolHeader(call),
    documentId: id,
    name: named(docName, id),
    ...(outcome.evidence ? evidenceDetail(outcome.evidence) : callEvidence(call.args)),
    applied: outcome.applied,
    reason: outcome.applied ? 'retired' : 'no change: the row could not be retired',
  };
}

export function stateCostDetail(call: ParsedToolCall, docName: NameLookup, outcome: { documentId: string | null; applied: boolean }) {
  const amount = typeof call.args.amount === 'number' ? call.args.amount : Number(call.args.amount);
  const currency = str(call.args.currency);
  const instanceName = str(call.args.instance_name);
  const id = outcome.documentId ?? str(call.args.document_id);
  return {
    ...toolHeader(call),
    documentId: id,
    name: named(docName, id),
    ...(instanceName !== '' ? { instanceName } : {}),
    amount,
    currency,
    ...callEvidence(call.args),
    applied: outcome.applied,
    reason: outcome.applied ? `stated ${amount.toLocaleString('en-US')} ${currency}`.trim() : 'no change: the row could not be marked stated',
  };
}

export function stateVehicleDetail(
  call: ParsedToolCall,
  docName: NameLookup,
  outcome: { documentId: string | null; applied: boolean; factsLine: string; statementCount: number },
) {
  const instanceName = str(call.args.instance_name);
  const id = outcome.documentId ?? str(call.args.document_id);
  return {
    ...toolHeader(call),
    documentId: id,
    name: named(docName, id),
    ...(instanceName !== '' ? { instanceName } : {}),
    factsLine: outcome.factsLine,
    statementCount: outcome.statementCount,
    ...callEvidence(call.args),
    applied: outcome.applied,
    reason: outcome.applied ? `stated: ${outcome.factsLine}` : 'no change: the row could not be marked stated',
  };
}

export function attestationDetail(call: ParsedToolCall, outcome: { applied: boolean; emailId?: string }) {
  const action = str(call.args.action);
  return {
    ...toolHeader(call),
    action,
    ...callEvidence(call.args),
    ...(outcome.emailId ? { emailId: outcome.emailId } : {}),
    applied: outcome.applied,
    reason: !outcome.applied
      ? `${action}: not applied`
      : action === 'confirmed'
        ? 'attestation confirmed'
        : `attestation requested on draft ${outcome.emailId ?? '?'}`,
  };
}

/** What the collect step decided and did, as plan.ts collects it: the input of the per-call attribution. */
export interface CollectionResult {
  newlyCollected: readonly string[];
  newlyClaimed: readonly string[];
  /** Every file-to-document pair that was linked, already re-pointed at the rows the split created. */
  proposedPairs: readonly { file_id: string; document_id: string }[];
  refusedTies: readonly RefusedTie[];
  splitDetail: CompanySplitDetail;
}

/** What the per-company split of this cycle did (openspec `unlisted-files`), as plan.ts collects it. */
export interface CompanySplitDetail {
  renamed: { documentId: string; oldName: string; newName: string }[];
  /** `employer` is set for a row the employer stage made (a fund of one company divided per employer). */
  created: { documentId: string; name: string; fromDocumentId: string; fileId: string; employer?: string | null }[];
}

export type TieOutcome = 'tied' | 'repointed' | 'refused' | 'ignored' | 'dropped';
export type CollectOutcome = 'collected' | 'claimed' | 'pending' | 'unchanged' | 'skipped';

export interface AttributedToolStep {
  call: ParsedToolCall;
  detail: Record<string, unknown>;
  target: { type: string; id: string };
}

/**
 * The outcome of every `tie_file` and `mark_collected` call of the answer, in
 * call order, read off the group computation of the collect step: a tie is
 * tied (under the row it named, or re-pointed to the sibling the split created
 * for its file), refused by code with the reason, ignored before the checks
 * (unknown file or document, quarantined file, split parent), or dropped by a
 * write race; a collection mark became collected, claimed (no file proves
 * it), stayed pending (its tie was refused, or nothing proved it), changed
 * nothing (the row was not pending), or was skipped in the follow-up cycle
 * after verification.
 */
export function attributeCollectionOutcome(
  calls: readonly ParsedToolCall[],
  result: CollectionResult,
  ctx: {
    afterVerification: boolean;
    /** The rows that were pending before this cycle's split. */
    pendingIds: ReadonlySet<string>;
    /** The rows that existed before this cycle's split. */
    documentIds: ReadonlySet<string>;
    fileById: ReadonlyMap<string, DocumentFileRow>;
    docName: NameLookup;
    fileName: NameLookup;
  },
): AttributedToolStep[] {
  const steps: AttributedToolStep[] = [];
  for (const call of calls) {
    if (call.name === 'tie_file') {
      const fileId = str(call.args.file_id);
      const documentId = str(call.args.document_id);
      const base = {
        ...toolHeader(call),
        fileId,
        fileName: named(ctx.fileName, fileId),
        documentId,
        name: named(ctx.docName, documentId),
        ...callEvidence(call.args),
      };
      const file = ctx.fileById.get(fileId);
      const applicable = applicableFilePairs([{ file_id: fileId, document_id: documentId }], ctx.fileById, ctx.documentIds).length > 0;
      let detail: Record<string, unknown>;
      if (!applicable || (file && isQuarantined(file))) {
        const why = !file ? 'unknown file' : !ctx.documentIds.has(documentId) ? 'unknown document' : isQuarantined(file) ? 'file quarantined' : 'split parent';
        detail = { ...base, outcome: 'ignored' satisfies TieOutcome, reason: `ignored: ${why}` };
      } else {
        const refused = result.refusedTies.find((r) => r.file_id === fileId && r.document_id === documentId);
        const pair = refused ? undefined : result.proposedPairs.find((p) => p.file_id === fileId);
        if (refused) {
          detail = { ...base, outcome: 'refused' satisfies TieOutcome, refusal: refused.reason, reason: `refused: ${refused.reason}` };
        } else if (!pair) {
          detail = { ...base, outcome: 'dropped' satisfies TieOutcome, reason: 'dropped: the row changed under the cycle' };
        } else {
          const endedUnderName = named(ctx.docName, pair.document_id);
          const rename = result.splitDetail.renamed.find((r) => r.documentId === documentId);
          const created = result.splitDetail.created.filter((c) => c.fileId === fileId);
          const repointed = pair.document_id !== documentId;
          detail = {
            ...base,
            outcome: (repointed ? 'repointed' : 'tied') satisfies TieOutcome,
            endedUnderId: pair.document_id,
            endedUnderName,
            ...(rename ? { renamedFrom: rename.oldName, renamedTo: rename.newName } : {}),
            ...(created.length > 0
              ? { created: created.map((c) => `${c.name} ← ${named(ctx.fileName, c.fileId)}${c.employer ? ` (${c.employer})` : ''}`) }
              : {}),
            reason: repointed ? `tied → ${endedUnderName}` : rename ? `tied · renamed → ${rename.newName}` : 'tied',
          };
        }
      }
      steps.push({ call, detail, target: { type: 'document_file', id: fileId } });
    } else if (call.name === 'mark_collected') {
      const documentId = str(call.args.document_id);
      const base = { ...toolHeader(call), documentId, name: named(ctx.docName, documentId) };
      let outcome: CollectOutcome;
      let reason: string;
      if (ctx.afterVerification) {
        outcome = 'skipped';
        reason = 'skipped: nothing is collected in the cycle after verification';
      } else if (!ctx.pendingIds.has(documentId)) {
        outcome = 'unchanged';
        reason = ctx.documentIds.has(documentId) ? 'no change: the row was not pending' : 'no change: unknown document';
      } else if (result.newlyCollected.includes(documentId)) {
        outcome = 'collected';
        reason = 'collected';
      } else if (result.newlyClaimed.includes(documentId)) {
        outcome = 'claimed';
        reason = 'claimed: no file proves it, waits for the accountant';
      } else if (result.refusedTies.some((r) => r.document_id === documentId)) {
        outcome = 'pending';
        reason = 'pending: its file tie was refused';
      } else {
        outcome = 'pending';
        reason = 'pending: no file proves it';
      }
      // Siblings the split created from this row are collected when it was.
      const also = result.splitDetail.created
        .filter((c) => c.fromDocumentId === documentId && result.newlyCollected.includes(c.documentId))
        .map((c) => c.name);
      steps.push({
        call,
        detail: { ...base, outcome, ...(also.length > 0 ? { alsoCollected: also } : {}), reason },
        target: { type: 'client_document', id: documentId },
      });
    }
  }
  return steps;
}

export function sendMessageDetail(
  call: ParsedToolCall,
  outcome: {
    emailId: string;
    sendAt: string;
    requestedSendAt: string;
    requested: 'asap' | 'time';
    rolled: boolean;
    chars: number;
    templateName?: string | null;
  },
) {
  const template = call.name === 'send_whatsapp_template';
  return {
    ...toolHeader(call),
    emailId: outcome.emailId,
    channel: 'whatsapp',
    kind: template ? 'template' : 'freeform',
    ...(template
      ? { templateId: str(call.args.template_id), ...(outcome.templateName ? { templateName: outcome.templateName } : {}), variables: strs(call.args.variables) }
      : {}),
    send_at: outcome.sendAt,
    requestedSendAt: outcome.requestedSendAt,
    requested: outcome.requested,
    rolled: outcome.rolled,
    chars: outcome.chars,
    reason: `scheduled ${outcome.sendAt}${outcome.rolled ? ' (rolled off a weekend / chag)' : outcome.requested === 'asap' ? ' (asap)' : ''}`,
  };
}

export function taxFetchDetail(call: ParsedToolCall, outcome: { applied: boolean; provider: string | null; documentKeys: readonly string[] | null; emailId: string | null }) {
  const action = str(call.args.action);
  return {
    ...toolHeader(call),
    action,
    provider: outcome.provider ?? str(call.args.provider),
    documentKeys: outcome.documentKeys ?? strs(call.args.document_keys),
    ...(outcome.emailId ? { emailId: outcome.emailId } : {}),
    applied: outcome.applied,
    reason: outcome.applied ? `${action} applied` : `${action}: no fetch context for this provider`,
  };
}

export function concludeDetail(
  call: ParsedToolCall,
  outcome:
    | { kind: 'collect'; collectedNames: string[]; verified: { documentName: string; fileName: string }[] }
    | { kind: 'follow_up' }
    | { kind: 'goal_complete'; completed: true; derived: boolean }
    | { kind: 'goal_complete'; completed: false; why: string }
    | { kind: 'client_declined' },
) {
  const base = { ...toolHeader(call), decision: str(call.args.decision), reasoning: str(call.args.reasoning) };
  switch (outcome.kind) {
    case 'collect':
      return {
        ...base,
        collected: outcome.collectedNames,
        verifying: outcome.verified.map((v) => `${v.documentName} ← ${v.fileName}`),
        reason: `reply withheld · verifying ${outcome.verified.length} document${outcome.verified.length === 1 ? '' : 's'}`,
      };
    case 'follow_up':
      return { ...base, reason: 'follow-up: the message is scheduled next' };
    case 'goal_complete':
      return outcome.completed
        ? { ...base, reason: outcome.derived ? 'goal completed (every row settled and the attestation confirmed)' : 'goal completed' }
        : { ...base, applied: false, reason: `premature: ${outcome.why}` };
    case 'client_declined':
      return { ...base, reason: 'the client declined: the decline routine answers and pauses' };
  }
}
