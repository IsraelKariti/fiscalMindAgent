import {
  evidenceQuote,
  type ApprovedFileEvidence,
  type DocumentResolution,
  type DocumentRetirement,
  type EvidenceRef,
  type InstanceAddition,
  type StatedCost,
  type StatedVehicle,
} from './decisionSchema.js';
import { vehicleFactsLine } from './vehicleDeclaration.js';
import type { RefusedTie } from './fileTies.js';

/**
 * The audit detail of each `apply_*` step the planner records (plan.ts).
 * Pure builders so the shape the trace modal reads is pinned by a test: every
 * document the step touched is named (name next to id), because the audit row
 * must stay meaningful on its own — FKs null out on delete and the admin
 * viewer has no documents list to resolve ids against.
 */

/** Resolves a document id to its display name; the id itself when unknown. */
export type NameLookup = (id: string) => string | null | undefined;

const named = (lookup: NameLookup, id: string): string => lookup(id) ?? id;

export function resolutionsStepDetail(resolutions: DocumentResolution[], docName: NameLookup, count: number) {
  return {
    count,
    rows: resolutions.map((r) => ({
      id: r.documentId,
      name: named(docName, r.documentId),
      resolution: r.resolution,
      // The client's own words, or (required only) the self-evident file the planner cited (openspec `unlisted-files`).
      ...evidenceDetail(r.evidence),
      ...(r.resolution === 'required' ? { instances: r.instances.map((i) => i.name) } : {}),
    })),
  };
}

/**
 * What an addition or retirement rested on, as the trace shows it: the client's
 * quote, or the approved property paper the planner cited instead (openspec
 * `real-estate-goal-driven-clarification`) — then `quote` names the file and
 * the proven fact, and `provenByFileId` carries the id for the viewer.
 */
function evidenceDetail(evidence: EvidenceRef): { quote: string; provenByFileId?: string } {
  const quote = evidenceQuote(evidence);
  if (quote !== null) return { quote };
  if ('source' in evidence && evidence.source === 'self_evident_file') {
    // A file in the client's (or spouse's) name created the item (openspec `unlisted-files`).
    const who = evidence.matched === 'client' ? 'על שם הלקוח' : 'על שם בן/בת הזוג';
    const employer = evidence.employer ? `, מעסיק ${evidence.employer}` : '';
    return { quote: `נוצר מקובץ ${who} (${evidence.issuer}${employer})`, provenByFileId: evidence.file_id };
  }
  const file = evidence as ApprovedFileEvidence;
  const fact = file.fact === 'seller_private' ? 'המוכר אדם פרטי' : 'המוכר קבלן / חברה';
  return { quote: `הוכח בקובץ שאושר (${fact})`, provenByFileId: file.file_id };
}

export function additionsStepDetail(additions: InstanceAddition[], docName: NameLookup, count: number) {
  return {
    count,
    entries: additions.map((a) => ({
      anchorId: a.anchorDocumentId,
      anchorName: named(docName, a.anchorDocumentId),
      instances: a.instances.map((i) => i.name),
      ...evidenceDetail(a.evidence),
    })),
  };
}

export function retirementsStepDetail(retired: DocumentRetirement[], docName: NameLookup, count: number) {
  return {
    count,
    rows: retired.map((r) => ({ id: r.documentId, name: named(docName, r.documentId), ...evidenceDetail(r.evidence) })),
  };
}

/** One cost the client stated in the chat, as plan.ts applied it (openspec `chat-stated-cost`): the row it closed and the statement. */
export interface AppliedStatedCost extends StatedCost {
  documentId: string;
}

export function statedCostsStepDetail(stated: AppliedStatedCost[], docName: NameLookup, count: number) {
  return {
    count,
    rows: stated.map((s) => ({
      id: s.documentId,
      name: named(docName, s.documentId),
      amount: s.amount,
      currency: s.currency,
      quote: s.evidence.quote,
      messageId: s.evidence.message_id,
    })),
  };
}

/** One vehicle statement the client made, as plan.ts applied it (openspec `vehicle-declaration`): the row it filled and the statement. */
export interface AppliedStatedVehicle extends StatedVehicle {
  documentId: string;
  /** How many statements the row holds after this one (1 = first). */
  statementCount: number;
}

export function vehicleDeclarationsStepDetail(stated: AppliedStatedVehicle[], docName: NameLookup, count: number) {
  return {
    count,
    rows: stated.map((s) => ({
      id: s.documentId,
      name: named(docName, s.documentId),
      facts: s.facts,
      factsLine: vehicleFactsLine(s.facts),
      statementCount: s.statementCount,
      quote: s.evidence.quote,
      messageId: s.evidence.message_id,
    })),
  };
}

/** What the per-company split of this cycle did (openspec `unlisted-files`), as plan.ts collects it. */
export interface CompanySplitDetail {
  renamed: { documentId: string; oldName: string; newName: string }[];
  /** `employer` is set for a row the employer stage made (a fund of one company divided per employer). */
  created: { documentId: string; name: string; fromDocumentId: string; fileId: string; employer?: string | null }[];
}

export function collectionsStepDetail(
  args: {
    proposed: string[];
    collected: string[];
    claimed: string[];
    pairs: { file_id: string; document_id: string }[];
    /** Ties code refused (company check, or a file named for a new row that may not take it). */
    refused?: RefusedTie[];
    /** The per-company split, when this cycle made one. */
    split?: CompanySplitDetail;
  },
  docName: NameLookup,
  fileName: NameLookup,
) {
  const names = (ids: string[]) => ids.map((id) => named(docName, id));
  const split = args.split
    ? {
        renamed: args.split.renamed.map((r) => ({ documentId: r.documentId, oldName: r.oldName, newName: r.newName })),
        created: args.split.created.map((c) => ({
          documentId: c.documentId,
          name: c.name,
          fromDocumentId: c.fromDocumentId,
          fromName: args.split?.renamed.find((r) => r.documentId === c.fromDocumentId)?.oldName ?? named(docName, c.fromDocumentId),
          fileId: c.fileId,
          fileName: named(fileName, c.fileId),
          ...(c.employer ? { employer: c.employer } : {}),
        })),
      }
    : undefined;
  return {
    ...(split ? { split } : {}),
    proposed: args.proposed,
    proposedNames: names(args.proposed),
    collected: args.collected,
    collectedNames: names(args.collected),
    claimed: args.claimed,
    claimedNames: names(args.claimed),
    pairs: args.pairs.map((m) => ({
      fileId: m.file_id,
      fileName: named(fileName, m.file_id),
      documentId: m.document_id,
      documentName: named(docName, m.document_id),
    })),
    refused: (args.refused ?? []).map((r) => ({
      fileId: r.file_id,
      fileName: named(fileName, r.file_id),
      documentId: r.document_id,
      documentName: named(docName, r.document_id),
      reason: r.reason,
    })),
  };
}
