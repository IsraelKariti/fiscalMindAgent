import { isEmployerBound, isInstitutionBound } from './catalog.js';
import { identifyInstitution, institutionLabelHe, type Institution } from './institutions.js';
import { cleanEmployer, employerKey, nameContainsEmployer } from './splitChildNames.js';
import type { ClientDocumentRow, DocumentFileRow } from '../../db/types.js';

/**
 * Pure rule for the per-company and per-employer split of a list item
 * (openspec `unlisted-files`): when the planner's cycle ties files of known
 * companies to an item that names no company ("ביטוח מנהלים ניב"), the item
 * is renamed after the first company and every further company gets a
 * sibling item, each named "<item> — <company>" from the institutions table.
 * For an employer-bound type (a fund opened per employer — study fund,
 * pension/provident) the files of each resulting item are then divided by
 * the employer printed on them the same way: "<item> — <company> — <employer>",
 * one item per employer. The model proposes nothing here — code divides an
 * item the client already agreed to among the companies and employers of the
 * files received for it. No imports of llm/db/audit, so the tests run without
 * a database.
 */

type SplitDocument = Pick<ClientDocumentRow, 'id' | 'name' | 'type_key'>;

export interface SplitPair {
  file_id: string;
  document_id: string;
}

/** The head row keeps its id and takes the first company's (and first employer's) name. */
export interface CompanySplitRename {
  documentId: string;
  oldName: string;
  newName: string;
}

/** The evidence a created row carries: the file that created it, its printed issuer and, for an employer row, the cleaned employer. */
export interface FileSplitEvidence {
  source: 'file';
  file_id: string;
  issuer: string;
  employer?: string;
}

/** One sibling row to create for a further company or employer, with the files it takes. */
export interface CompanySplitCreated {
  fromDocumentId: string;
  name: string;
  /** The table key of the row's company; null when the company is not recognised (an employer row of such an item). */
  companyKey: string | null;
  /** The cleaned employer the row is for; null for a row the company stage alone made. */
  employer: string | null;
  /** In tie order; the first one is the row's evidence. */
  fileIds: string[];
  evidence: FileSplitEvidence;
}

export interface CompanySplitPlan<T extends SplitPair> {
  renames: CompanySplitRename[];
  created: CompanySplitCreated[];
  /** The input pairs minus those moved to a created row, in input order (the head keeps its own). */
  pairs: T[];
}

/** Longest issuer text stored as evidence. */
const MAX_ISSUER = 200;

const SEPARATOR = ' — ';

function evidenceIssuer(issuer: string | null | undefined): string {
  return (issuer ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_ISSUER);
}

/**
 * The name an employer sibling is built on: the item's name without the
 * employer it already carries. The employer is the trailing " — " part that
 * follows the company part ("קרן השתלמות ניב — מיטב — פרייסמנס בע"מ" →
 * "קרן השתלמות ניב — מיטב"); with no company part, or nothing after it, the
 * name is used whole.
 */
export function employerBaseName(name: string, institutions?: readonly Institution[]): string {
  const parts = name.split(SEPARATOR);
  if (parts.length < 2) return name;
  const last = parts[parts.length - 1]!;
  const beforeLast = parts[parts.length - 2]!;
  if (identifyInstitution(last, institutions) === null && identifyInstitution(beforeLast, institutions) !== null) {
    return parts.slice(0, -1).join(SEPARATOR);
  }
  return name;
}

/** One item (the head, or a company sibling planned this cycle) with the files it holds after the company stage. */
interface Group<T extends SplitPair> {
  /** The name the row has after the company stage (the head's new name, or the sibling's planned name). */
  name: string;
  companyKey: string | null;
  pairs: T[];
  /** The company sibling this group is, when it is one; the head has none. */
  created: CompanySplitCreated | null;
}

/**
 * Plans the split for one cycle's allowed pairs. Untouched: pairs to an item
 * of a type no institution issues, to an unknown item, and files whose
 * company the table does not recognise (they stay on the head, renamed or
 * not) or that print no employer (they stay on the item of their company).
 * Companies and employers are ordered by their first tied file; files of one
 * company (and, for an employer-bound type, one employer) share one row.
 */
export function planCompanySplit<T extends SplitPair>(
  pairs: readonly T[],
  fileById: ReadonlyMap<string, DocumentFileRow>,
  documents: readonly SplitDocument[],
  institutions?: readonly Institution[],
): CompanySplitPlan<T> {
  const docById = new Map(documents.map((d) => [d.id, d]));
  const byDocument = new Map<string, T[]>();
  for (const pair of pairs) {
    const list = byDocument.get(pair.document_id);
    if (list) list.push(pair);
    else byDocument.set(pair.document_id, [pair]);
  }

  const renames: CompanySplitRename[] = [];
  const created: CompanySplitCreated[] = [];
  const moved = new Set<T>();

  for (const [documentId, docPairs] of byDocument) {
    const doc = docById.get(documentId);
    if (!doc || !isInstitutionBound(doc.type_key)) continue;

    // Stage 1 — company: an item that names no company takes the first
    // recognised company's name; every further company gets a sibling.
    const itemCompany = identifyInstitution(doc.name, institutions);
    const head: Group<T> = { name: doc.name, companyKey: itemCompany, pairs: [], created: null };
    const groups: Group<T>[] = [head];
    if (itemCompany === null) {
      const siblings = new Map<string, Group<T>>();
      for (const pair of docPairs) {
        const file = fileById.get(pair.file_id);
        const issuer = file?.analysis?.issuer_name ?? null;
        const key = identifyInstitution(issuer, institutions);
        if (key === null) {
          head.pairs.push(pair); // unrecognised: stays on the head
          continue;
        }
        if (head.companyKey === null) {
          head.companyKey = key;
          head.name = `${doc.name}${SEPARATOR}${institutionLabelHe(key, institutions)}`;
          head.pairs.push(pair);
          continue;
        }
        if (key === head.companyKey) {
          head.pairs.push(pair); // same company as the head: stays on it
          continue;
        }
        let sibling = siblings.get(key);
        if (!sibling) {
          const entry: CompanySplitCreated = {
            fromDocumentId: documentId,
            name: `${doc.name}${SEPARATOR}${institutionLabelHe(key, institutions)}`,
            companyKey: key,
            employer: null,
            fileIds: [],
            evidence: { source: 'file', file_id: pair.file_id, issuer: evidenceIssuer(issuer) },
          };
          sibling = { name: entry.name, companyKey: key, pairs: [], created: entry };
          siblings.set(key, sibling);
          groups.push(sibling);
        }
        sibling.pairs.push(pair);
        sibling.created!.fileIds.push(pair.file_id);
        moved.add(pair);
      }
    } else {
      head.pairs.push(...docPairs);
    }

    // Stage 2 — employer: for a fund opened per employer, each group's files
    // are divided by the employer printed on them. Runs whether or not the
    // company stage renamed the item, so an item that already names its
    // company is divided too.
    const employerBound = isEmployerBound(doc.type_key);
    const employerRows: CompanySplitCreated[][] = groups.map(() => []);
    if (employerBound) {
      groups.forEach((group, g) => {
        const base = employerBaseName(group.name, institutions);
        // An item that already names an employer (a row of an earlier split) is that employer's row.
        let groupEmployer: string | null = base === group.name ? null : employerKey(group.name.slice(base.length + SEPARATOR.length));
        const byEmployer = new Map<string, CompanySplitCreated>();
        for (const pair of group.pairs) {
          const file = fileById.get(pair.file_id);
          const employer = cleanEmployer(file?.analysis?.employer_name);
          if (employer === null) continue; // no employer printed: stays
          const key = employerKey(employer);
          if (nameContainsEmployer(group.name, employer)) {
            if (groupEmployer === null) groupEmployer = key; // the item already names this employer: stays
            continue;
          }
          if (groupEmployer === null) {
            groupEmployer = key;
            group.name = `${base}${SEPARATOR}${employer}`;
            if (group.created) {
              // The sibling row now stands for this employer: named and evidenced by the file that printed it.
              group.created.name = group.name;
              group.created.employer = employer;
              group.created.evidence = { source: 'file', file_id: pair.file_id, issuer: evidenceIssuer(file?.analysis?.issuer_name), employer };
            }
            continue;
          }
          if (key === groupEmployer) continue; // same employer as the group: stays
          let row = byEmployer.get(key);
          if (!row) {
            const issuer = file?.analysis?.issuer_name ?? null;
            row = {
              fromDocumentId: documentId,
              name: `${base}${SEPARATOR}${employer}`,
              companyKey: group.companyKey,
              employer,
              fileIds: [],
              evidence: { source: 'file', file_id: pair.file_id, issuer: evidenceIssuer(issuer), employer },
            };
            byEmployer.set(key, row);
            employerRows[g]!.push(row);
          }
          row.fileIds.push(pair.file_id);
          if (group.created) group.created.fileIds = group.created.fileIds.filter((id) => id !== pair.file_id);
          moved.add(pair);
        }
      });
    }

    if (head.name !== doc.name) renames.push({ documentId, oldName: doc.name, newName: head.name });
    groups.forEach((group, g) => {
      if (group.created) created.push(group.created);
      created.push(...employerRows[g]!);
    });
  }

  return { renames, created, pairs: pairs.filter((p) => !moved.has(p)) };
}
