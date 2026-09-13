import type { DocumentResolution, InstanceAddition, DocumentRetirement, MatchedFile } from './decisionSchema.js';

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
      ...(r.resolution === 'not_required' ? { quote: r.evidence.quote } : { instances: r.instances.map((i) => i.name) }),
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
    })),
  };
}

export function retirementsStepDetail(retired: DocumentRetirement[], docName: NameLookup, count: number) {
  return {
    count,
    rows: retired.map((r) => ({ id: r.documentId, name: named(docName, r.documentId), quote: r.evidence.quote })),
  };
}

export function collectionsStepDetail(
  args: { proposed: string[]; collected: string[]; claimed: string[]; pairs: MatchedFile[] },
  docName: NameLookup,
  fileName: NameLookup,
) {
  const names = (ids: string[]) => ids.map((id) => named(docName, id));
  return {
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
  };
}
