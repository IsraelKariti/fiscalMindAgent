import type { DocumentResolution, InstanceAddition, DocumentRetirement } from './decisionSchema.js';
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
      // Every resolution rests on the client's own words (openspec `unlisted-files`).
      quote: r.evidence.quote,
      ...(r.resolution === 'required' ? { instances: r.instances.map((i) => i.name) } : {}),
    })),
  };
}

export function additionsStepDetail(additions: InstanceAddition[], docName: NameLookup, count: number) {
  return {
    count,
    entries: additions.map((a) => ({
      anchorId: a.anchorDocumentId,
      anchorName: named(docName, a.anchorDocumentId),
      instances: a.instances.map((i) => i.name),
      quote: a.evidence.quote,
    })),
  };
}

export function retirementsStepDetail(retired: DocumentRetirement[], docName: NameLookup, count: number) {
  return {
    count,
    rows: retired.map((r) => ({ id: r.documentId, name: named(docName, r.documentId), quote: r.evidence.quote })),
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
